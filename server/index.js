import "dotenv/config";
import { createHash, randomInt, randomBytes } from "node:crypto";
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { q, pool } from "./db.js";
import { answer, detectLang } from "./bot.js";
import {
  createLead,
  notifyStaff,
  sendVerificationEmail,
  sendStaffInvitationEmail,
} from "./integrations.js";
import { askAI, aiEnabled } from "./ai.js";
import { fetchUrlText } from "./kb.js";

const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const app = express();
app.use(cors());
app.use(express.json());
const h = (fn) => (req, res, next) => fn(req, res, next).catch(next); // async error wrapper

// attaches req.user (null for guests)
app.use(
  h(async (req, _res, next) => {
    try {
      const p = jwt.verify(
        (req.headers.authorization || "").replace("Bearer ", ""),
        SECRET,
      );
      req.user =
        (
          await q(
            "SELECT id,name,email,role FROM users WHERE id=$1 AND NOT disabled",
            [p.id],
          )
        ).rows[0] || null;
    } catch {
      req.user = null;
    }
    next();
  }),
);
const need =
  (...roles) =>
  (req, res, next) =>
    !req.user
      ? res.status(401).json({ error: "login_required" })
      : roles.length && !roles.includes(req.user.role)
        ? res.status(403).json({ error: "forbidden" })
        : next();
const audit = (req, action, target) =>
  q("INSERT INTO audit_logs (user_id,action,target) VALUES ($1,$2,$3)", [
    req.user.id,
    action,
    String(target),
  ]);
// validate staff invitation
app.get(
  "/api/auth/staff-invitation",
  h(async (req, res) => {
    const token = String(req.query.token || "");

    if (!/^[a-f0-9]{64}$/i.test(token)) {
      return res.status(400).json({ error: "invalid_invitation" });
    }

    const tokenHash = createHash("sha256").update(token).digest("hex");

    const result = await q(
      `SELECT name, email FROM staff_invitations
     WHERE token_hash = $1
       AND accepted_at IS NULL
       AND expires_at > now()`,
      [tokenHash],
    );

    if (!result.rowCount) {
      return res.status(400).json({ error: "invalid_or_expired_invitation" });
    }

    res.json(result.rows[0]);
  }),
);

// accept staff invitation and set password
app.post(
  "/api/auth/staff-invitation/accept",
  h(async (req, res) => {
    const token = String(req.body.token || "");
    const password = String(req.body.password || "");
    const confirmPassword = String(req.body.confirmPassword || "");

    if (!/^[a-f0-9]{64}$/i.test(token)) {
      return res.status(400).json({ error: "invalid_invitation" });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: "weak_password" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: "password_mismatch" });
    }

    const tokenHash = createHash("sha256").update(token).digest("hex");
    const passwordHash = await bcrypt.hash(password, 12);
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const invitation = await client.query(
        `SELECT id, name, email FROM staff_invitations
       WHERE token_hash = $1
         AND accepted_at IS NULL
         AND expires_at > now()
       FOR UPDATE`,
        [tokenHash],
      );

      if (!invitation.rowCount) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "invalid_or_expired_invitation" });
      }

      const { id, name, email } = invitation.rows[0];

      await client.query(
        `INSERT INTO users (name, email, password_hash, role, email_verified)
       VALUES ($1, $2, $3, 'staff', true)`,
        [name, email, passwordHash],
      );

      await client.query(
        "UPDATE staff_invitations SET accepted_at = now() WHERE id = $1",
        [id],
      );

      await client.query("COMMIT");

      res.status(201).json({ message: "invitation_accepted" });
    } catch (error) {
      await client.query("ROLLBACK");
      if (error.code === "23505") {
        return res.status(409).json({ error: "email_already_registered" });
      }
      throw error;
    } finally {
      client.release();
    }
  }),
);
app.post(
  "/api/auth/login",
  h(async (req, res) => {
    const u = (await q("SELECT * FROM users WHERE email=$1", [req.body.email]))
      .rows[0];
    if (
      !u ||
      u.disabled ||
      !bcrypt.compareSync(String(req.body.password || ""), u.password_hash)
    )
      return res.status(401).json({ error: "bad_credentials" });
    if (!u.email_verified) {
      return res.status(403).json({ error: "email_not_verified" });
    }
    await q("UPDATE users SET last_login=now() WHERE id=$1", [u.id]);
    res.json({
      token: jwt.sign({ id: u.id }, SECRET, { expiresIn: "8h" }),
      user: { id: u.id, name: u.name, email: u.email, role: u.role },
    });
  }),
);

app.post(
  "/api/auth/register",
  h(async (req, res) => {
    const { firstName, lastName, email, password, confirmPassword } = req.body;

    const first = String(firstName || "").trim();
    const last = String(lastName || "").trim();
    const mail = String(email || "")
      .trim()
      .toLowerCase();

    if (!first || !last || !mail || !password || !confirmPassword) {
      return res.status(400).json({ error: "missing_fields" });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      return res.status(400).json({ error: "invalid_email" });
    }

    if (String(password).length < 8) {
      return res.status(400).json({ error: "weak_password" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: "password_mismatch" });
    }

    const code = String(randomInt(100000, 1000000));
    const codeHash = createHash("sha256")
      .update(`${code}:${SECRET}`)
      .digest("hex");

    const passwordHash = await bcrypt.hash(password, 12);

    try {
      const result = await q(
        `INSERT INTO users
        (name, email, password_hash, role, email_verified,
         verification_code_hash, verification_expires_at)
       VALUES ($1, $2, $3, 'student', false, $4, now() + interval '10 minutes')
       RETURNING id`,
        [`${first} ${last}`, mail, passwordHash, codeHash],
      );

      await sendVerificationEmail(mail, code);

      return res.status(201).json({
        message: "verification_email_sent",
        userId: result.rows[0].id,
      });
    } catch (error) {
      if (error.code === "23505") {
        return res.status(409).json({ error: "email_already_registered" });
      }

      console.error("Registration error:", error.message);
      return res.status(500).json({ error: "registration_failed" });
    }
  }),
);

app.post(
  "/api/auth/verify-email",
  h(async (req, res) => {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();
    const code = String(req.body.code || "").trim();

    if (!email || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: "invalid_code" });
    }

    const codeHash = createHash("sha256")
      .update(`${code}:${SECRET}`)
      .digest("hex");

    const result = await q(
      `UPDATE users
     SET email_verified = true,
         verification_code_hash = NULL,
         verification_expires_at = NULL
     WHERE email = $1
       AND verification_code_hash = $2
       AND verification_expires_at > now()
       AND email_verified = false
       AND NOT disabled
     RETURNING id, name, email`,
      [email, codeHash],
    );

    if (!result.rowCount) {
      return res.status(400).json({ error: "invalid_or_expired_code" });
    }

    res.json({ message: "email_verified" });
  }),
);

app.get("/api/me", need(), (req, res) => res.json(req.user));

// simple per-IP limit so nobody can burn the AI budget
const hits = new Map();
const limiter = (req, res, next) => {
  const now = Date.now(),
    a = (hits.get(req.ip) || []).filter((t) => now - t < 60000);
  if (a.length >= 20) return res.status(429).json({ error: "slow_down" });
  a.push(now);
  hits.set(req.ip, a);
  next();
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RULE_KEYS = ["studentOnly", "sched", "pay", "excuse", "attend"];

// chat: booking + student-private answers stay rule-based (server-side authorisation); everything else goes to Claude with the approved KB
app.post(
  "/api/chat",
  limiter,
  h(async (req, res) => {
    const text = String(req.body.text || "").slice(0, 1000);
    const lang = detectLang(text, req.body.lang);
    const kb = (
      await q("SELECT topic,status FROM kb_sources WHERE status='Approved'")
    ).rows;
    const rule = answer(text, req.user, kb);
    let cid = req.body.conversationId,
      ctok;
    const tok = String(req.body.convToken || "");
    if (
      cid &&
      !(
        UUID.test(tok) &&
        (
          await q("SELECT 1 FROM conversations WHERE id=$1 AND token=$2", [
            cid,
            tok,
          ])
        ).rowCount
      )
    )
      cid = null; // unknown or foreign conversation: start a new one
    if (!cid) {
      const c = (
        await q(
          "INSERT INTO conversations (user_id,lang) VALUES ($1,$2) RETURNING id, token",
          [req.user?.id || null, lang],
        )
      ).rows[0];
      cid = c.id;
      ctok = c.token;
    }
    let out = rule;
    if (
      !(
        rule.kind === "slots" ||
        (rule.kind === "text" && RULE_KEYS.includes(rule.key))
      ) &&
      aiEnabled()
    ) {
      try {
        out = {
          kind: "ai",
          text: await askAI({ text, lang, conversationId: cid }),
        };
      } catch (e) {
        console.error("AI error:", e.message);
        out = e.transient
          ? { kind: "text", key: "busy" }
          : { kind: "fallback", key: "fb" };
      }
    }
    await q(
      "INSERT INTO messages (conversation_id,role,content) VALUES ($1,$2,$3),($1,$4,$5)",
      [
        cid,
        "user",
        text,
        "bot",
        out.kind === "ai" ? out.text : `[key:${out.key}]`,
      ],
    );
    res.json({ lang, conversationId: cid, convToken: ctok, ...out });
  }),
);

// interview bookings (applicants and students); creates a CRM lead with the conversation attached
app.post(
  "/api/bookings",
  h(async (req, res) => {
    const {
      slot,
      date = "2026-11-24",
      name,
      surname,
      email,
      phone,
      conversationId,
    } = req.body;
    if (!slot || !name || !email)
      return res.status(400).json({ error: "missing_fields" });
    let b;
    try {
      b = (
        await q(
          "INSERT INTO bookings (conversation_id,slot_date,slot_time,name,surname,email,phone) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *",
          [conversationId || null, date, slot, name, surname, email, phone],
        )
      ).rows[0];
    } catch (e) {
      if (e.code === "23505")
        return res.status(409).json({ error: "slot_taken" });
      throw e;
    }
    const conversation = conversationId
      ? (
          await q(
            "SELECT role,content FROM messages WHERE conversation_id=$1 ORDER BY id",
            [conversationId],
          )
        ).rows
      : [];
    const lead = await createLead({
      name,
      surname,
      email,
      phone,
      slot,
      date,
      source: "academy-chatbot",
      conversation,
    });
    await q("UPDATE bookings SET lead_id=$1 WHERE id=$2", [
      String(lead.id),
      b.id,
    ]);
    res.json({ booking: b, leadId: lead.id });
  }),
);
app.delete(
  "/api/bookings/:id",
  h(async (req, res) => {
    const r = await q(
      "UPDATE bookings SET cancelled=true WHERE id=$1 RETURNING id",
      [req.params.id],
    );
    r.rowCount ? res.json(r.rows[0]) : res.sendStatus(404);
  }),
);

// support requests (handoff to humans)
const SUP = `SELECT id, from_name AS "from", topic, status, to_char(created_at,'DD Mon, HH24:MI') AS created FROM support_requests`;
app.post(
  "/api/support",
  h(async (req, res) => {
    const from = req.user
      ? `${req.user.name} (${req.user.role})`
      : "Guest (applicant)";
    const topic = String(req.body.topic || "Needs human answer").slice(0, 120);
    const r = await q(
      "INSERT INTO support_requests (conversation_id,from_name,topic) VALUES ($1,$2,$3) RETURNING id",
      [req.body.conversationId || null, from, topic],
    );
    await notifyStaff(`New support request: ${from} - ${topic}`);
    res.json({ id: r.rows[0].id });
  }),
);
app.get(
  "/api/support",
  need("staff", "admin"),
  h(async (_q, res) =>
    res.json((await q(SUP + " ORDER BY created_at DESC")).rows),
  ),
);
app.get(
  "/api/support/:id",
  need("staff", "admin"),
  h(async (req, res) => {
    const r = (await q(SUP + " WHERE id=$1", [req.params.id])).rows[0];
    if (!r) return res.sendStatus(404);
    const cid = (
      await q("SELECT conversation_id FROM support_requests WHERE id=$1", [
        req.params.id,
      ])
    ).rows[0].conversation_id;
    const messages = cid
      ? (
          await q(
            "SELECT id,role,content,to_char(created_at,'HH24:MI') AS time FROM messages WHERE conversation_id=$1 ORDER BY id",
            [cid],
          )
        ).rows
      : [];
    res.json({ ...r, messages });
  }),
);
app.post(
  "/api/support/:id/reply",
  need("staff", "admin"),
  h(async (req, res) => {
    const text = String(req.body.text || "")
      .trim()
      .slice(0, 2000);
    if (!text) return res.status(400).json({ error: "empty" });
    const row = (
      await q("SELECT conversation_id FROM support_requests WHERE id=$1", [
        req.params.id,
      ])
    ).rows[0];
    if (!row || !row.conversation_id)
      return res.status(404).json({ error: "no_conversation" });
    await q(
      "INSERT INTO messages (conversation_id,role,content) VALUES ($1,'staff',$2)",
      [row.conversation_id, text],
    );
    await q(
      "UPDATE support_requests SET status='In progress' WHERE id=$1 AND status='New'",
      [req.params.id],
    );
    await audit(req, "support:reply", req.params.id);
    res.json({ ok: true });
  }),
);
// the user's chat polls this to receive staff replies (needs the conversation's secret token)
app.get(
  "/api/conversations/:id/staff",
  h(async (req, res) => {
    const tok = String(req.query.token || "");
    if (
      !UUID.test(tok) ||
      !(
        await q("SELECT 1 FROM conversations WHERE id=$1 AND token=$2", [
          req.params.id,
          tok,
        ])
      ).rowCount
    )
      return res.sendStatus(404);
    res.json(
      (
        await q(
          "SELECT id,content FROM messages WHERE conversation_id=$1 AND role='staff' AND id>$2 ORDER BY id",
          [req.params.id, Number(req.query.after) || 0],
        )
      ).rows,
    );
  }),
);
app.patch(
  "/api/support/:id",
  need("staff", "admin"),
  h(async (req, res) => {
    if (
      !["New", "In progress", "Resolved", "Transferred"].includes(
        req.body.status,
      )
    )
      return res.status(400).json({ error: "bad_status" });
    const r = await q(
      "UPDATE support_requests SET status=$1 WHERE id=$2 RETURNING id",
      [req.body.status, req.params.id],
    );
    if (!r.rowCount) return res.sendStatus(404);
    await audit(req, "support:" + req.body.status, req.params.id);
    res.json(r.rows[0]);
  }),
);

// admin: invite staff
app.post(
  "/api/users/invite",
  need("admin"),
  h(async (req, res) => {
    const firstName = String(req.body.firstName || "").trim();
    const lastName = String(req.body.lastName || "").trim();
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();

    if (!firstName || !lastName || !email) {
      return res.status(400).json({ error: "missing_fields" });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "invalid_email" });
    }

    const name = `${firstName} ${lastName}`;

    if ((await q("SELECT 1 FROM users WHERE email=$1", [email])).rowCount) {
      return res.status(409).json({ error: "email_already_registered" });
    }

    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    await q(
      `INSERT INTO staff_invitations (name, email, token_hash, expires_at, created_by)
     VALUES ($1, $2, $3, $4, $5)`,
      [name, email, tokenHash, expiresAt, req.user.id],
    );

    const frontendUrl = process.env.CLIENT_URL || "http://localhost:5173";
    const link = `${frontendUrl}/staff-invitation?token=${token}`;

    try {
      await sendStaffInvitationEmail(email, name, link);
    } catch (error) {
      await q(
        "DELETE FROM staff_invitations WHERE email=$1 AND token_hash=$2",
        [email, tokenHash],
      );
      throw error;
    }

    await audit(req, "staff:invite", email);
    res.status(201).json({ message: "invitation_sent" });
  }),
);
// admin: users
app.get(
  "/api/users",
  need("admin"),
  h(async (_q, res) =>
    res.json(
      (
        await q(
          `SELECT id,name,email,role,disabled, COALESCE(to_char(last_login,'DD Mon YYYY'),'-') AS "lastLogin" FROM users ORDER BY id`,
        )
      ).rows,
    ),
  ),
);

app.patch(
  "/api/users/:id",
  need("admin"),
  h(async (req, res) => {
    if (typeof req.body.disabled !== "boolean")
      return res.status(400).json({ error: "bad_body" });
    const r = await q("UPDATE users SET disabled=$1 WHERE id=$2 RETURNING id", [
      req.body.disabled,
      req.params.id,
    ]);
    if (!r.rowCount) return res.sendStatus(404);
    await audit(
      req,
      req.body.disabled ? "user:disable" : "user:enable",
      req.params.id,
    );
    res.json(r.rows[0]);
  }),
);

// admin: knowledge base
app.get(
  "/api/kb",
  need("admin"),
  h(async (_q, res) =>
    res.json(
      (
        await q(
          `SELECT id,name,type,topic,status,to_char(updated_at,'DD Mon YYYY') AS updated FROM kb_sources ORDER BY updated_at DESC, id DESC`,
        )
      ).rows,
    ),
  ),
);
app.post(
  "/api/kb",
  need("admin"),
  h(async (req, res) => {
    // PDF / DOCX / TXT / URL only in MVP (PRD 8.2)
    const type = String(req.body.type || "").toUpperCase();
    if (!["PDF", "DOCX", "TXT", "URL"].includes(type))
      return res.status(400).json({ error: "unsupported_type" });
    let content = String(req.body.content || "");
    if (type === "URL") {
      try {
        content = (await fetchUrlText(req.body.name)).text;
      } catch (e) {
        return res
          .status(400)
          .json({ error: "fetch_failed", detail: e.message });
      }
    }
    const r = await q(
      "INSERT INTO kb_sources (name,type,topic,content) VALUES ($1,$2,$3,$4) RETURNING id",
      [req.body.name, type, req.body.topic || "general", content],
    );
    await audit(req, "kb:add", r.rows[0].id);
    res.json(r.rows[0]);
  }),
);
app.patch(
  "/api/kb/:id/approve",
  need("admin"),
  h(async (req, res) => {
    const r = await q(
      "UPDATE kb_sources SET status='Approved', updated_at=now() WHERE id=$1 RETURNING id",
      [req.params.id],
    );
    if (!r.rowCount) return res.sendStatus(404);
    await audit(req, "kb:approve", req.params.id);
    res.json(r.rows[0]);
  }),
);
app.delete(
  "/api/kb/:id",
  need("admin"),
  h(async (req, res) => {
    await q("DELETE FROM kb_sources WHERE id=$1", [req.params.id]);
    await audit(req, "kb:remove", req.params.id);
    res.sendStatus(204);
  }),
);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "server_error" });
});
app.listen(process.env.PORT || 4000, () =>
  console.log("API on http://localhost:" + (process.env.PORT || 4000)),
);
