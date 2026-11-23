import { Fragment, useEffect, useRef, useState } from "react";
import { L, B } from "./i18n.js";
import { api, setToken } from "./api.js";

const HOME = { admin: "users", staff: "sup", student: "chat" };
const SLOTS = ["11:00", "12:30", "15:00", "17:30"];
const SK = {
  Active: "s_active",
  Disabled: "s_disabled",
  Approved: "s_approved",
  "Needs approval": "s_needs",
  New: "s_new",
  "In progress": "s_prog",
  Resolved: "s_res",
  Transferred: "s_tr",
};
const MON = {
  en: [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ],
  hy: [
    "հունվ",
    "փետր",
    "մարտ",
    "ապր",
    "մայ",
    "հունս",
    "հուլ",
    "օգս",
    "սեպտ",
    "հոկտ",
    "նոյ",
    "դեկտ",
  ],
  ru: [
    "янв",
    "фев",
    "мар",
    "апр",
    "май",
    "июн",
    "июл",
    "авг",
    "сен",
    "окт",
    "нояб",
    "дек",
  ],
};
const fmtDate = (s, lang) =>
  String(s).replace(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/,
    (m) => MON[lang][MON.en.indexOf(m)],
  );
const TP = {
  "Needs human answer": "tp_human",
  "Payment question": "tp_pay",
  "Unclear course info": "tp_course",
};
const trFrom = (s, t) =>
  String(s || "Unknown")
    .replace(/^Guest \(applicant\)$/, `${t("guest")} (${t("r_applicant")})`)
    .replace(/\((student|staff|admin)\)$/, (_, r) => `(${t("r_" + r)})`);

// tiny safe renderer for the AI's light formatting: **bold**, *italic*, "- " lists, headings as bold
function inline(s) {
  const out = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let last = 0,
    m,
    k = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    out.push(
      m[1] ? <strong key={k++}>{m[1]}</strong> : <em key={k++}>{m[2]}</em>,
    );
    last = re.lastIndex;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}
function Md({ text }) {
  const blocks = [];
  let list = null;
  text.split("\n").forEach((raw) => {
    const line = raw.trim();
    const li = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (li) {
      if (!list) {
        list = [];
        blocks.push({ ul: list });
      }
      list.push(li[1]);
      return;
    }
    list = null;
    if (line)
      blocks.push(
        /^#{1,6}\s/.test(line)
          ? { p: "**" + line.replace(/^#{1,6}\s*/, "") + "**" }
          : { p: line },
      );
  });
  return (
    <>
      {blocks.map((b, i) =>
        b.ul ? (
          <ul key={i}>
            {b.ul.map((x, j) => (
              <li key={j}>{inline(x)}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>{inline(b.p)}</p>
        ),
      )}
    </>
  );
}

const chipColor = (s) =>
  ({
    Active: "cy",
    Approved: "cy",
    "In progress": "cy",
    New: "mg",
    "Needs approval": "mg",
  })[s] || "mu";

const Cube = ({ h = 40 }) => (
  <svg
    viewBox="240 120 144 136"
    height={h}
    role="img"
    aria-label="Picsart Academy"
    style={{ display: "block", flex: "none" }}
  >
    <path d="M250 237 L313 222 L378 237 L313 251 Z" fill="#000" />
    <path
      d="M313 127 L262 140 Q246 144 246 160 L246 225 Q246 233 254 231 L313 221 Z"
      fill="#66FFF2"
    />
    <path
      d="M313 127 L366 141 Q378 144 378 158 L378 229 Q378 236 370 234 L313 221 Z"
      fill="#CC00CC"
    />
    <g
      fill="#fff"
      fontFamily="Space Grotesk, Inter, sans-serif"
      fontWeight="700"
      fontSize="13"
      transform="rotate(14 322 192)"
    >
      <text x="321" y="190">
        Picsart
      </text>
      <text x="321" y="206">
        Academy
      </text>
    </g>
  </svg>
);

export default function App() {
  const [lang, setLang] = useState("en");
  const [user, setUser] = useState(null);
  const isStaffInvitation = window.location.pathname === "/staff-invitation";
  const [view, setView] = useState(
    isStaffInvitation ? "staff-invitation" : "login",
  );
  const [toast, setToast] = useState("");
  const [verifyEmail, setVerifyEmail] = useState("");
  const note = (m) => {
    setToast(m);
    setTimeout(() => setToast(""), 2200);
  };
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  useEffect(() => {
    if (isStaffInvitation) return;
    api("/me")
      .then((u) => {
        setUser(u);
        setView(HOME[u.role]);
      })
      .catch(() => {});
  }, []);
  const p = {
    lang,
    setLang,
    user,
    setUser,
    setView,
    note,
    verifyEmail,
    setVerifyEmail,
  };
  return (
    <>
      {view === "login" ? (
        <Login {...p} />
      ) : view === "signup" ? (
        <SignUp {...p} />
      ) : view === "verify" ? (
        <VerifyEmail {...p} />
      ) : view === "staff-invitation" ? (
        <StaffInvitation {...p} />
      ) : view === "chat" ? (
        <Chat {...p} />
      ) : (
        <Admin {...p} view={view} />
      )}
      {toast && <div className="toast mono">{toast}</div>}
    </>
  );
}
function StaffInvitation({ lang, setView, note }) {
  const t = (k) => L[lang][k];
  const token = new URLSearchParams(window.location.search).get("token");

  const [invitation, setInvitation] = useState(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("invalid_invitation");
      setLoading(false);
      return;
    }

    api("/auth/staff-invitation?token=" + encodeURIComponent(token))
      .then(setInvitation)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const submit = async () => {
    setError("");

    if (password.length < 8) {
      setError("Password must contain at least 8 characters");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setSubmitting(true);

    try {
      await api("/auth/staff-invitation/accept", {
        method: "POST",
        body: { token, password, confirmPassword },
      });

      setAccepted(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login">
      <div style={{ position: "absolute", top: 20, right: 24, zIndex: 5 }}>
        <LangSwitch lang={lang} setLang={() => {}} />
      </div>

      <div className="stage">
        <div className="beam c" />
        <div className="beam m" />
        <div className="art2">
          <i className="hc" />
          <i className="hm" />
          <span className="mono tag2">&gt; join. learn. create.</span>
          <h1>
            Picsart
            <br />
            Academy
          </h1>
        </div>
      </div>

      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <span className="mono cy">&gt; staff --invitation</span>
        <h1>
          Set your password<i>.</i>
        </h1>

        {loading ? (
          <p>Checking invitation...</p>
        ) : accepted ? (
          <>
            <p>Your account has been activated successfully!</p>
            <button className="btn" onClick={() => setView("login")}>
              Go to Login
            </button>
          </>
        ) : error && !invitation ? (
          <>
            <p className="mu">This invitation link is invalid or expired.</p>
            <button className="btn sec" onClick={() => setView("login")}>
              Go to Login
            </button>
          </>
        ) : invitation ? (
          <>
            <p className="mu">Welcome, {invitation.name}!</p>
            <p className="mu">{invitation.email}</p>

            <div>
              <div className="mu" style={{ fontSize: 14, marginBottom: 6 }}>
                Password
              </div>
              <input
                type="password"
                required
                minLength={8}
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div>
              <div className="mu" style={{ fontSize: 14, marginBottom: 6 }}>
                Confirm password
              </div>
              <input
                type="password"
                required
                minLength={8}
                placeholder="Repeat your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            {error && <p style={{ color: "#ff6b6b" }}>{error}</p>}

            <button className="btn" type="submit" disabled={submitting}>
              {submitting ? "Activating..." : "Activate Account"}
            </button>
          </>
        ) : null}
      </form>
    </div>
  );
}
function LangSwitch({ lang, setLang }) {
  return (
    <div className="lang mono">
      {[
        ["hy", "ՀԱՅ"],
        ["en", "EN"],
        ["ru", "РУ"],
      ].map(([k, n]) => (
        <button
          key={k}
          className={lang === k ? "on" : ""}
          onClick={() => setLang(k)}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

function NavList({ view, user, t, setView }) {
  const items = user?.role === "admin" ? ["users", "sup", "kb"] : ["sup"];
  return (
    <>
      {items.map((v) => (
        <button
          key={v}
          className={"nav " + (view === v ? "on" : "")}
          onClick={() => setView(v)}
        >
          {view === v ? "> " : ""}
          {t(v)}
        </button>
      ))}
      <button
        className={"nav " + (view === "chat" ? "on" : "")}
        onClick={() => setView("chat")}
      >
        {view === "chat" ? "> " : ""}
        {t("chat")}
      </button>
    </>
  );
}

function Top({ cmd, lang, setLang, user, setUser, setView }) {
  const out = () => {
    setToken(null);
    setUser(null);
    setView("login");
  };
  return (
    <div className="top">
      <span className="mono cy">&gt; {cmd}</span>
      <span className="sp" />
      <LangSwitch lang={lang} setLang={setLang} />
      <span
        className="chip mono"
        style={{ borderColor: user ? "var(--mg)" : "var(--cy)" }}
        onClick={user ? out : () => setView("login")}
      >
        {user
          ? `${user.name} · ${L[lang].out}`
          : `${L[lang].guest.toUpperCase()} · ${L[lang].login}`}
      </span>
    </div>
  );
}

function Login({ lang, setLang, setUser, setView, note }) {
  const t = (k) => L[lang][k];
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const go = async () => {
    if (!email.trim() || !pw) {
      note("Please fill in all fields.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      note("Please enter a valid email.");
      return;
    }

    try {
      const r = await api("/auth/login", {
        method: "POST",
        body: { email, password: pw },
      });
      setToken(r.token);
      setUser(r.user);
      setView(HOME[r.user.role]);
    } catch (e) {
      note(
        e.message === "bad_credentials"
          ? t("wrong")
          : t("srvProblem") + ": " + e.message,
      );
    }
  };
  return (
    <div className="login">
      <div style={{ position: "absolute", top: 20, right: 24, zIndex: 5 }}>
        <LangSwitch lang={lang} setLang={setLang} />
      </div>
      {/* Login hero, version B (flat colour block with outer glow). Swap for the 3D cube or version C from the demos if you prefer. */}
      <div className="stage">
        <div className="beam c" />
        <div className="beam m" />
        <div className="art2">
          <i className="hc" />
          <i className="hm" />
          <span className="mono tag2">&gt; learn. build. create.</span>
          <h1>
            Picsart
            <br />
            Academy
          </h1>
        </div>
      </div>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
      >
        <span className="mono cy">&gt; auth --sign-in</span>
        <h1>
          {t("welcomeBack")}
          <i>.</i>
        </h1>
        <div>
          <div className="mu" style={{ fontSize: 14, marginBottom: 6 }}>
            {t("email")}
          </div>
          <input
            type="email"
            required
            placeholder="student@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div>
          <div className="mu" style={{ fontSize: 14, marginBottom: 6 }}>
            {t("password")}
          </div>
          <input
            type="password"
            required
            placeholder="Enter your password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
        </div>

        <button className="btn" type="submit">
          {t("login")}
        </button>

        <button className="btn sec" onClick={() => setView("chat")}>
          {t("guestBtn")}
        </button>
        <p className="auth-switch">
          {t("noAccount")}{" "}
          <button type="button" onClick={() => setView("signup")}>
            {t("signUp")}
          </button>
        </p>
      </form>
    </div>
  );
}
function SignUp({ lang, setLang, setView, setVerifyEmail, note }) {
  const t = (k) => L[lang][k];

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const register = async () => {
    try {
      const r = await api("/auth/register", {
        method: "POST",
        body: {
          firstName,
          lastName,
          email,
          password,
          confirmPassword,
        },
      });

      setVerifyEmail(email.trim().toLowerCase());
      setView("verify");
      note("Verification code sent to your email.");
    } catch (e) {
      const messages = {
        missing_fields: "Please fill in all fields.",
        invalid_email: "Please enter a valid email.",
        weak_password: "Password must be at least 8 characters.",
        password_mismatch: "Passwords do not match.",
        email_already_registered: "This email is already registered.",
      };

      note(messages[e.message] || "Registration failed: " + e.message);
    }
  };

  return (
    <div className="login">
      <div style={{ position: "absolute", top: 20, right: 24, zIndex: 5 }}>
        <LangSwitch lang={lang} setLang={setLang} />
      </div>

      <div className="stage">
        <div className="beam c" />
        <div className="beam m" />
        <div className="art2">
          <i className="hc" />
          <i className="hm" />
          <span className="mono tag2">&gt; learn. build. create.</span>
          <h1>
            Picsart
            <br />
            Academy
          </h1>
        </div>
      </div>

      <form
        className="form auth-signup"
        onSubmit={(e) => {
          e.preventDefault();
          register();
        }}
      >
        <span className="mono cy">&gt; auth --sign-up</span>
        <h1>
          {t("createAccount")}
          <i>.</i>
        </h1>

        <div>
          <div className="mu" style={{ fontSize: 14, marginBottom: 6 }}>
            {t("firstName")}
          </div>
          <input
            required
            placeholder={t("enterFirstName")}
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
        </div>

        <div>
          <div className="mu" style={{ fontSize: 14, marginBottom: 6 }}>
            {t("lastName")}
          </div>
          <input
            required
            placeholder={t("enterLastName")}
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
        </div>

        <div>
          <div className="mu" style={{ fontSize: 14, marginBottom: 6 }}>
            {t("email")}
          </div>
          <input
            type="email"
            required
            placeholder={t("enterEmail")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <div className="mu" style={{ fontSize: 14, marginBottom: 6 }}>
            {t("password")}
          </div>
          <input
            type="password"
            required
            minLength={8}
            placeholder={t("enterPassword")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div>
          <div className="mu" style={{ fontSize: 14, marginBottom: 6 }}>
            {t("confirmPassword")}
          </div>
          <input
            type="password"
            required
            minLength={8}
            placeholder={t("repeatPassword")}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>

        <button className="btn" type="submit">
          {t("signUp")}
        </button>

        <p className="auth-switch">
          {t("haveAccount")}{" "}
          <button type="button" onClick={() => setView("login")}>
            {t("login")}
          </button>
        </p>
      </form>
    </div>
  );
}
function VerifyEmail({ verifyEmail, setView, note }) {
  const [code, setCode] = useState("");

  const verify = async () => {
    try {
      await api("/auth/verify-email", {
        method: "POST",
        body: { email: verifyEmail, code },
      });

      note("Email verified successfully. Please log in.");
      setView("login");
    } catch (e) {
      const messages = {
        invalid_code: "Please enter a valid 6-digit code.",
        invalid_or_expired_code: "Invalid or expired code.",
      };

      note(messages[e.message] || "Verification failed: " + e.message);
    }
  };

  return (
    <div className="login">
      <div className="form">
        <span className="mono cy">&gt; auth --verify-email</span>
        <h1>
          Verify your email<i>.</i>
        </h1>

        <p>We sent a verification code to {verifyEmail}.</p>

        <input
          type="text"
          placeholder="Enter 6-digit code"
          value={code}
          maxLength={6}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        />

        <button className="btn" onClick={verify} disabled={code.length !== 6}>
          Verify Email
        </button>

        <p className="auth-switch">
          <button type="button" onClick={() => setView("login")}>
            Back to Login
          </button>
        </p>
      </div>
    </div>
  );
}
function ContactForm({ slot, bt, onSubmit }) {
  const [f, setF] = useState({ name: "", surname: "", email: "", phone: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="card">
      <span className="mono cy">&gt; contact --details</span>
      <div className="row">
        <input placeholder={bt("name")} value={f.name} onChange={set("name")} />
        <input
          placeholder={bt("surname")}
          value={f.surname}
          onChange={set("surname")}
        />
      </div>
      <div className="row">
        <input
          placeholder={bt("email")}
          value={f.email}
          onChange={set("email")}
        />
        <input
          placeholder="+374 ## ### ###"
          value={f.phone}
          onChange={set("phone")}
        />
      </div>
      <button
        className="btn"
        disabled={!f.name || !f.email}
        onClick={() => onSubmit(slot, f)}
      >
        {bt("cont")}
      </button>
    </div>
  );
}

function Chat({ lang, setLang, user, setUser, setView, note }) {
  const t = (k) => L[lang][k];
  const bt = (k) => B[lang][k];
  const [msgs, setMsgs] = useState([]);
  const [hist, setHist] = useState(["@h1", "@h2"]);
  const [text, setText] = useState("");
  const [cid, setCid] = useState(null);
  const [ctok, setCtok] = useState(null);
  const [waiting, setWaiting] = useState(false);
  const lastStaff = useRef(0);
  const [busy, setBusy] = useState(false);
  const end = useRef();
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);
  const push = (...m) => setMsgs((x) => [...x, ...m]);
  useEffect(() => {
    // after a hand-off, check for staff replies every few seconds
    if (!cid || !ctok || !waiting) return;
    const id = setInterval(async () => {
      try {
        const rows = await api(
          `/conversations/${cid}/staff?token=${ctok}&after=${lastStaff.current}`,
        );
        if (rows.length) {
          lastStaff.current = rows[rows.length - 1].id;
          push(...rows.map((r) => ({ r: "b", k: "staff", text: r.content })));
        }
      } catch {
        /* ignore */
      }
    }, 5000);
    return () => clearInterval(id);
  }, [cid, ctok, waiting]);

  async function send(raw) {
    const q = raw.trim();
    if (!q) return;
    setText("");
    push({ r: "u", text: q });
    setBusy(true);
    if (!msgs.length) setHist((h) => [q.slice(0, 34), ...h]);
    try {
      const res = await api("/chat", {
        method: "POST",
        body: { text: q, lang, conversationId: cid, convToken: ctok },
      });
      setCid(res.conversationId);
      if (res.convToken) setCtok(res.convToken);
      if (res.lang !== lang) setLang(res.lang);
      push({ r: "b", k: res.kind, key: res.key, text: res.text });
    } catch {
      note(t("srvDown"));
    } finally {
      setBusy(false);
    }
  }
  const review = (slot, f) =>
    push(
      { r: "u", text: `${f.name} ${f.surname}, ${f.email}` },
      { r: "b", k: "text", key: "sumq" },
      { r: "b", k: "confirm", slot, f },
    );
  const confirm = async (slot, f) => {
    push({ r: "u", text: bt("conf") });
    try {
      await api("/bookings", {
        method: "POST",
        body: { slot, ...f, conversationId: cid },
      });
      push({ r: "b", k: "text", key: "okmsg" });
    } catch {
      push({ r: "b", k: "text", key: "nomsg" });
      note(t("slotErr"));
    }
  };
  const handoff = async () => {
    await api("/support", {
      method: "POST",
      body: { topic: "Needs human answer", conversationId: cid },
    });
    setWaiting(true);
    push({ r: "u", text: bt("connect") }, { r: "b", k: "text", key: "hand" });
    note(bt("toast"));
  };

  const render = (m, i) => {
    if (m.r === "u")
      return (
        <div key={i} className="b u">
          {m.text}
        </div>
      );
    if (m.k === "ai")
      return (
        <div key={i} className="b">
          <Md text={m.text} />
        </div>
      );
    if (m.k === "staff")
      return (
        <div key={i} className="b" style={{ borderColor: "var(--mg)" }}>
          <span className="mono mg" style={{ fontSize: 12 }}>
            {t("r_staff")}
          </span>
          <br />
          {m.text}
        </div>
      );
    if (m.k === "text")
      return (
        <div key={i} className="b">
          {bt(m.key)}
        </div>
      );
    if (m.k === "fallback")
      return (
        <div key={i} className="b">
          {bt("fb")}
          <br />
          <br />
          <button className="btn sec" onClick={handoff}>
            {bt("connect")}
          </button>
        </div>
      );
    if (m.k === "slots")
      return (
        <Fragment key={i}>
          <div className="b">{bt("book")}</div>
          <div className="card">
            <span className="mono cy">&gt; select --slot</span>
            <b>{bt("date")}</b>
            <div className="row">
              {SLOTS.map((s) => (
                <button
                  key={s}
                  className="slot mono"
                  onClick={() =>
                    push(
                      { r: "u", text: s },
                      { r: "b", k: "text", key: "contact" },
                      { r: "b", k: "form", slot: s },
                    )
                  }
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </Fragment>
      );
    if (m.k === "form")
      return <ContactForm key={i} slot={m.slot} bt={bt} onSubmit={review} />;
    if (m.k === "confirm")
      return (
        <div key={i} className="card c">
          <span className="mono mg">&gt; confirm --action</span>
          <b>
            {bt("interview")} / {bt("date")}, {m.slot}
          </b>
          <span className="mu">
            {m.f.name} {m.f.surname} / {m.f.email}
          </span>
          <div className="row">
            <button className="btn" onClick={() => confirm(m.slot, m.f)}>
              {bt("conf")}
            </button>
            <button
              className="btn sec"
              onClick={() =>
                push(
                  { r: "u", text: bt("canc") },
                  { r: "b", k: "text", key: "nomsg" },
                )
              }
            >
              {bt("canc")}
            </button>
          </div>
        </div>
      );
    return null;
  };

  const sugg = [
    t("s1"),
    t("s2"),
    t("s3"),
    ...(user?.role === "student" ? [t("s4"), t("s5")] : []),
  ];
  return (
    <div
      id="chat-root"
      style={{ display: "flex", width: "100%", height: "100%" }}
    >
      <div className="side">
        <div className="brand">
          <Cube h={40} />
          <div className="logo">
            PICSART
            <br />
            ACADEMY
          </div>
        </div>
        {(user?.role === "admin" || user?.role === "staff") && (
          <div style={{ margin: "16px 0 0" }}>
            <NavList view="chat" user={user} t={t} setView={setView} />
          </div>
        )}
        <div className="himg">
          <Cube h={88} />
        </div>
        <button
          className="btn nc"
          onClick={() => {
            setMsgs([]);
            setCid(null);
            setCtok(null);
            setWaiting(false);
            lastStaff.current = 0;
          }}
        >
          {t("nc")}
        </button>
        <div className="mono cy hh">
          <span>&gt; {t("hist")}</span>
          <span className="mu">{String(hist.length).padStart(2, "0")}</span>
        </div>
        {hist.map((h, i) => (
          <div key={i} className="hist">
            {h.startsWith("@") ? t(h.slice(1)) : h}
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <div className="foot">
          <div className="mono cy">&gt; learn. build. create.</div>
          <div className="mono mu">PICSART ACADEMY</div>
        </div>
      </div>
      <div className="main">
        <Top
          cmd="ask --academy"
          lang={lang}
          setLang={setLang}
          user={user}
          setUser={setUser}
          setView={setView}
        />
        <div className="msgs">
          {msgs.length === 0 && (
            <>
              <div className="hero">
                <div className="mono cy" style={{ marginBottom: 12 }}>
                  &gt; chat --academy --ask-anything
                </div>
                <h1>
                  {t("welcome")}
                  <i>.</i>
                </h1>
                <div
                  className="mono mu"
                  style={{ marginTop: 12, fontSize: 13 }}
                >
                  {t("sub")}
                </div>
              </div>
              <div className="b">
                {`${{ en: "Hi", hy: "Բարև", ru: "Привет" }[lang] || "Hi"} ${user?.name?.split(" ")[0] || ""}! ${t("hi").replace(/^(Hi!|Բարև։?|Привет!)\s*/, "")}`}
              </div>
            </>
          )}
          {msgs.map(render)}
          {busy && <div className="b mu">...</div>}
          <div ref={end} />
        </div>
        <div className="sugg">
          {sugg.map((s) => (
            <button key={s} className="chip" onClick={() => send(s)}>
              {s}
            </button>
          ))}
        </div>
        <div className="bar">
          <input
            placeholder={t("ph")}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send(text)}
          />
          <button className="btn" disabled={busy} onClick={() => send(text)}>
            {t("send")}
          </button>
        </div>
      </div>
    </div>
  );
}

const Act = ({ l, c = "", f }) => (
  <button className={`act ${c}`} onClick={f}>
    {l}
  </button>
);

function Admin({ view, lang, setLang, user, setUser, setView, note }) {
  const t = (k) => L[lang][k];
  const cfg = {
    users: {
      path: "/users",
      cmd: "users",
      head: ["hName", "hRole", "hStatus", "hLast", "hActions"],
    },
    sup: {
      path: "/support",
      cmd: "support-requests",
      head: ["hFrom", "hTopic", "hStatus", "hCreated", "hActions"],
    },
    kb: {
      path: "/kb",
      cmd: "knowledge-base",
      head: ["hSource", "hType", "hStatus", "hUpdated", "hActions"],
    },
  }[view];
  const [rows, setRows] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [reply, setReply] = useState("");
  const [showAddUser, setShowAddUser] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [userFilter, setUserFilter] = useState("all");
  const [newUser, setNewUser] = useState({
    firstName: "",
    lastName: "",
    email: "",
    role: "staff",
  });
  const [showAddSource, setShowAddSource] = useState(false);
  const [savingSource, setSavingSource] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  const [sourceTypeOpen, setSourceTypeOpen] = useState(false);
  const [sourceFile, setSourceFile] = useState(null);

  const [newSource, setNewSource] = useState({
    name: "",
    type: "PDF",
    topic: "courses",
  });

  const load = () =>
    api(cfg.path)
      .then((data) => {
        console.log("ADMIN DATA:", view, data);
        setRows(data);
      })
      .catch((error) => {
        console.error("ADMIN ERROR:", error);
        note(t("notAllowed"));
      });
  // const load = () => api(cfg.path).then(setRows).catch(() => note(t('notAllowed')));
  useEffect(() => {
    setOpenId(null);
    load();
  }, [view]);
  const act = async (method, url, body) => {
    try {
      await api(url, { method, body });
      load();
    } catch {
      note(t("reqFail"));
    }
  };

  const open = async (id) => {
    try {
      setDetail(await api("/support/" + id));
      setOpenId(id);
    } catch {
      note(t("reqFail"));
    }
  };
  const sendReply = async () => {
    if (!reply.trim()) return;
    try {
      await api(`/support/${openId}/reply`, {
        method: "POST",
        body: { text: reply },
      });
      setReply("");
      note(t("replySent"));
      open(openId);
      load();
    } catch {
      note(t("noConv"));
    }
  };
  const setStatus = async (status) => {
    await act("PATCH", "/support/" + openId, { status });
    open(openId);
  };
  const cells = (r) =>
    view === "users"
      ? [
          r.name,
          t("r_" + r.role),
          r.disabled ? "Disabled" : "Active",
          fmtDate(r.lastLogin, lang),
        ]
      : view === "sup"
        ? [
            trFrom(r.from, t),
            TP[r.topic] ? t(TP[r.topic]) : r.topic,
            r.status,
            fmtDate(r.created, lang),
          ]
        : [r.name, r.type, r.status, fmtDate(r.updated, lang)];
  const filteredRows =
    view === "users" && userFilter !== "all"
      ? rows.filter((r) => r.role === userFilter)
      : rows;

  const actions = (r) =>
    view === "users" ? (
      <Act
        l={r.disabled ? t("a_enable") : t("a_disable")}
        c="d"
        f={() => act("PATCH", "/users/" + r.id, { disabled: !r.disabled })}
      />
    ) : view === "sup" ? (
      <>
        {r.status === "New" && (
          <Act
            l={t("a_take")}
            c="a"
            f={() =>
              act("PATCH", "/support/" + r.id, { status: "In progress" })
            }
          />
        )}
        {r.status === "In progress" && (
          <>
            <Act l={t("a_reply")} c="a" f={() => open(r.id)} />
            <Act
              l={t("a_transfer")}
              f={() =>
                act("PATCH", "/support/" + r.id, { status: "Transferred" })
              }
            />
            <Act
              l={t("a_resolve")}
              f={() => act("PATCH", "/support/" + r.id, { status: "Resolved" })}
            />
          </>
        )}
        <Act l={t("a_open")} f={() => open(r.id)} />
      </>
    ) : (
      <>
        {r.status !== "Approved" && (
          <Act
            l={t("a_approve")}
            c="a"
            f={() => act("PATCH", "/kb/" + r.id + "/approve")}
          />
        )}
        <Act l={t("a_remove")} c="d" f={() => act("DELETE", "/kb/" + r.id)} />
      </>
    );
  const add =
    view === "users"
      ? () => setShowAddUser(true)
      : view === "kb"
        ? () => setShowAddSource(true)
        : null;
  const inviteStaff = async (e) => {
    e.preventDefault();

    if (newUser.role !== "staff") {
      note("Currently, only Staff invitations are supported.");
      return;
    }

    setSavingUser(true);

    try {
      await api("/users/invite", {
        method: "POST",
        body: newUser,
      });

      note("Staff invitation email sent successfully!");
      setShowAddUser(false);
      setNewUser({
        firstName: "",
        lastName: "",
        email: "",
        role: "staff",
      });
      load();
    } catch (error) {
      note(error.message);
    } finally {
      setSavingUser(false);
    }
  };

  const addSource = async (e) => {
    e.preventDefault();

    if (!newSource.name.trim()) {
      note(
        newSource.type === "URL"
          ? "Please enter a URL."
          : "Please enter a source name.",
      );
      return;
    }

    if (newSource.type !== "URL" && !sourceFile) {
      note("Please select a file.");
      return;
    }

    setSavingSource(true);

    try {
      const formData = new FormData();

      formData.append("name", newSource.name.trim());
      formData.append("type", newSource.type);
      formData.append("topic", newSource.topic || "general");

      if (sourceFile) {
        formData.append("file", sourceFile);
      }

      await api("/kb", {
        method: "POST",
        body: formData,
      });

      note("Knowledge source added successfully!");
      setShowAddSource(false);
      setSourceFile(null);
      setNewSource({
        name: "",
        type: "PDF",
        topic: "courses",
      });
      load();
    } catch (error) {
      note(error.message);
    } finally {
      setSavingSource(false);
    }
  };

  const showDetail = view === "sup" && openId && detail;
  const detailPanel = showDetail && (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        maxWidth: 760,
      }}
    >
      <button
        className="btn sec"
        style={{ alignSelf: "flex-start" }}
        onClick={() => {
          setOpenId(null);
          load();
        }}
      >
        ← {t("back")}
      </button>
      <h1 style={{ fontSize: 34 }}>
        {trFrom(detail.from, t)}
        <i>.</i>
      </h1>
      <div className="mu">
        {TP[detail.topic] ? t(TP[detail.topic]) : detail.topic} ·{" "}
        <b className={"st " + chipColor(detail.status)}>
          {SK[detail.status] ? t(SK[detail.status]) : detail.status}
        </b>
      </div>
      <div className="row" style={{ justifyContent: "flex-start" }}>
        {detail.status === "New" && (
          <Act l={t("a_take")} c="a" f={() => setStatus("In progress")} />
        )}
        <Act l={t("a_transfer")} f={() => setStatus("Transferred")} />
        <Act l={t("a_resolve")} f={() => setStatus("Resolved")} />
      </div>
      <div className="msgs" style={{ padding: 0, maxHeight: 380 }}>
        {detail.messages.length === 0 && (
          <div className="b mu">{t("noConv")}</div>
        )}
        {detail.messages.map((m) => (
          <div
            key={m.id}
            className={"b" + (m.role === "staff" ? " u" : "")}
            style={m.role === "user" ? undefined : { alignSelf: "flex-end" }}
          >
            <span className="mono mu" style={{ fontSize: 11 }}>
              {m.role === "user"
                ? t("who_user")
                : m.role === "staff"
                  ? t("r_staff")
                  : t("who_bot")}{" "}
              · {m.time}
            </span>
            <br />
            {m.content.startsWith("[key:")
              ? B[lang][m.content.slice(5, -1)] || m.content
              : m.content}
          </div>
        ))}
      </div>
      <div className="row">
        <input
          placeholder={t("replyPh")}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendReply()}
        />
        <button className="btn" style={{ flex: "none" }} onClick={sendReply}>
          {t("a_reply")}
        </button>
      </div>
    </div>
  );
  return (
    <div style={{ display: "flex", width: "100%", height: "100%" }}>
      <div className="side">
        <div className="logo">PICSART ACADEMY</div>
        <span className="mono cy" style={{ fontSize: 12 }}>
          &gt; {t("r_" + user?.role)}
        </span>
        <div style={{ height: 12 }} />
        <NavList view={view} user={user} t={t} setView={setView} />
      </div>
      <div className="main">
        <Top
          cmd={"admin --" + cfg.cmd}
          lang={lang}
          setLang={setLang}
          user={user}
          setUser={setUser}
          setView={setView}
        />
        <div className="content">
          {detailPanel}
          <div
            style={{
              display: showDetail ? "none" : "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <h1>
              {t(view)}
              <i>.</i>
            </h1>
            {add && (
              <button className="btn" onClick={add}>
                {t(view === "users" ? "addUser" : "add")}
              </button>
            )}
          </div>
          {view === "users" && !showDetail && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                margin: "20px 0",
              }}
            >
              <label className="mono mu">FILTER BY ROLE:</label>

              {[
                { value: "all", label: "All users" },
                { value: "admin", label: "Admin" },
                { value: "staff", label: "Staff" },
                { value: "student", label: "Student" },
              ].map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setUserFilter(item.value)}
                  style={{
                    padding: "9px 16px",
                    background:
                      userFilter === item.value ? "var(--mg)" : "transparent",
                    border: `1px solid ${userFilter === item.value ? "var(--mg)" : "var(--bd)"}`,
                    color:
                      userFilter === item.value ? "var(--tx)" : "var(--mu)",
                    font: '500 12px "JetBrains Mono"',
                    cursor: "pointer",
                    boxShadow:
                      userFilter === item.value
                        ? "0 0 18px rgba(190,41,188,.4)"
                        : "none",
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
          <div
            className="tbl"
            style={showDetail ? { display: "none" } : undefined}
          >
            <div className="tr h">
              {cfg.head.map((h) => (
                <span key={h}>{t(h)}</span>
              ))}
            </div>
            {filteredRows.map((r) => {
              const c = cells(r);
              return (
                <div className="tr" key={r.id}>
                  <span>{c[0]}</span>
                  <span className="mu">{c[1]}</span>
                  <span>
                    <b className={"st " + chipColor(c[2])}>
                      {SK[c[2]] ? t(SK[c[2]]) : c[2]}
                    </b>
                  </span>
                  <span className="mu">{c[3]}</span>
                  <span>{actions(r)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {view === "users" && showAddUser && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(11,11,13,.48)",
            backdropFilter: "blur(3px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <form
            onSubmit={inviteStaff}
            style={{
              width: "100%",
              maxWidth: 460,
              background: "rgba(24,24,27,.88)",
              backdropFilter: "blur(18px)",
              border: "1px solid var(--mg)",
              boxShadow: "0 0 35px rgba(190,41,188,.28)",
              padding: 28,
              display: "flex",
              flexDirection: "column",
              gap: 18,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h2
                style={{
                  margin: 0,
                  font: '700 24px "Space Grotesk"',
                  color: "var(--cy)",
                  textTransform: "uppercase",
                  letterSpacing: ".04em",
                }}
              >
                ADD USER
              </h2>
              <button
                type="button"
                className="btn sec"
                onClick={() => setShowAddUser(false)}
              >
                ×
              </button>
            </div>

            <label
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                font: '500 13px "JetBrains Mono"',
                color: "var(--cy)",
              }}
            >
              FIRST NAME
              <input
                required
                value={newUser.firstName}
                onChange={(e) =>
                  setNewUser({ ...newUser, firstName: e.target.value })
                }
              />
            </label>

            <label
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                font: '500 13px "JetBrains Mono"',
                color: "var(--cy)",
              }}
            >
              LAST NAME
              <input
                required
                value={newUser.lastName}
                onChange={(e) =>
                  setNewUser({ ...newUser, lastName: e.target.value })
                }
              />
            </label>

            <label
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                font: '500 13px "JetBrains Mono"',
                color: "var(--cy)",
              }}
            >
              EMAIL
              <input
                type="email"
                required
                value={newUser.email}
                onChange={(e) =>
                  setNewUser({ ...newUser, email: e.target.value })
                }
              />
            </label>
            <label
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                font: '500 13px "JetBrains Mono"',
                color: "var(--cy)",
              }}
            >
              ROLE
              <div style={{ position: "relative", width: "100%" }}>
                <button
                  type="button"
                  onClick={() => setRoleOpen(!roleOpen)}
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: "var(--bg)",
                    color: "var(--cy)",
                    border: "1px solid var(--bd)",
                    font: '14px "Inter", sans-serif',
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  {newUser.role.charAt(0).toUpperCase() + newUser.role.slice(1)}
                  <span>{roleOpen ? "▲" : "▼"}</span>
                </button>

                {roleOpen && (
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      width: "100%",
                      zIndex: 10,
                      background: "var(--sf)",
                      border: "1px solid var(--cy)",
                    }}
                  >
                    {["staff", "student", "admin"].map((role) => (
                      <button
                        key={role}
                        type="button"
                        onClick={() => {
                          setNewUser({ ...newUser, role });
                          setRoleOpen(false);
                        }}
                        style={{
                          display: "block",
                          width: "100%",
                          padding: "12px 14px",
                          textAlign: "left",
                          background:
                            newUser.role === role
                              ? "rgba(125,249,233,.15)"
                              : "transparent",
                          color: "var(--cy)",
                          border: "none",
                          borderBottom: "1px solid var(--bd)",
                          font: '14px "Inter", sans-serif',
                          cursor: "pointer",
                        }}
                      >
                        {role.charAt(0).toUpperCase() + role.slice(1)}
                        {newUser.role === role ? " ✓" : ""}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </label>

            {newUser.role !== "staff" && (
              <p className="mu">
                Currently, only Staff invitations are supported.
              </p>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
              }}
            >
              <button
                type="button"
                className="btn sec"
                onClick={() => setShowAddUser(false)}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="btn"
                disabled={savingUser || newUser.role !== "staff"}
              >
                {savingUser ? "Sending..." : "Send Invitation"}
              </button>
            </div>
          </form>
        </div>
      )}

      {view === "kb" && showAddSource && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(11,11,13,.48)",
            backdropFilter: "blur(3px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <form
            onSubmit={addSource}
            style={{
              width: "100%",
              maxWidth: 460,
              background: "rgba(24,24,27,.88)",
              backdropFilter: "blur(18px)",
              border: "1px solid var(--mg)",
              boxShadow: "0 0 35px rgba(190,41,188,.28)",
              padding: 28,
              display: "flex",
              flexDirection: "column",
              gap: 18,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h2 style={{ margin: 0, color: "var(--cy)" }}>ADD SOURCE</h2>

              <button
                type="button"
                className="btn sec"
                onClick={() => setShowAddSource(false)}
              >
                ×
              </button>
            </div>

            <label>
              <span className="mu">Source Name / URL</span>
              <input
                className="input"
                value={newSource.name}
                onChange={(e) =>
                  setNewSource({
                    ...newSource,
                    name: e.target.value,
                  })
                }
                placeholder="Enter source name or URL"
                required
              />
            </label>

            <label
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                font: '500 13px "JetBrains Mono"',
                color: "var(--cy)",
              }}
            >
              SOURCE TYPE
              <div style={{ position: "relative", width: "100%" }}>
                <button
                  type="button"
                  onClick={() => setSourceTypeOpen(!sourceTypeOpen)}
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: "var(--bg)",
                    color: "var(--cy)",
                    border: "1px solid var(--bd)",
                    font: '14px "Inter", sans-serif',
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  {newSource.type}
                  <span>{sourceTypeOpen ? "▲" : "▼"}</span>
                </button>

                {sourceTypeOpen && (
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      width: "100%",
                      zIndex: 10,
                      background: "var(--sf)",
                      border: "1px solid var(--cy)",
                    }}
                  >
                    {["PDF", "DOCX", "TXT", "URL"].map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => {
                          setNewSource({ ...newSource, type });
                          setSourceFile(null);
                          setSourceTypeOpen(false);
                        }}
                        style={{
                          display: "block",
                          width: "100%",
                          padding: "12px 14px",
                          textAlign: "left",
                          background:
                            newSource.type === type
                              ? "rgba(125,249,233,.15)"
                              : "transparent",
                          color: "var(--cy)",
                          border: "none",
                          borderBottom: "1px solid var(--bd)",
                          font: '14px "Inter", sans-serif',
                          cursor: "pointer",
                        }}
                      >
                        {type}
                        {newSource.type === type ? " ✓" : ""}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </label>

            {newSource.type !== "URL" && (
              <label
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  font: '500 13px "JetBrains Mono"',
                  color: "var(--cy)",
                }}
              >
                UPLOAD FILE ({newSource.type})
                <div style={{ position: "relative", display: "inline-flex" }}>
                  <span
                    className="btn sec"
                    style={{
                      padding: "8px 14px",
                      fontSize: 11,
                      letterSpacing: "0.08em",
                      color: "var(--cy)",
                      border: "1px solid var(--cy)",
                      boxShadow: "0 0 10px rgba(125,249,233,.25)",
                      textShadow: "0 0 8px rgba(125,249,233,.5)",
                      transition: "all .2s ease",
                    }}
                  >
                    {sourceFile ? "Change File" : "Choose File"}
                  </span>

                  <input
                    key={newSource.type}
                    type="file"
                    accept={
                      newSource.type === "PDF"
                        ? ".pdf,application/pdf"
                        : newSource.type === "DOCX"
                          ? ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                          : ".txt,text/plain"
                    }
                    onChange={(e) => setSourceFile(e.target.files?.[0] || null)}
                    required
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      opacity: 0,
                      cursor: "pointer",
                    }}
                  />
                </div>
                {sourceFile && (
                  <button
                    type="button"
                    onClick={() => {
                      const fileUrl = URL.createObjectURL(sourceFile);
                      window.open(fileUrl, "_blank", "noopener,noreferrer");
                    }}
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      color: "var(--cy)",
                      textAlign: "left",
                      font: '13px "Inter", sans-serif',
                      textDecoration: "underline",
                      cursor: "pointer",
                      textShadow: "0 0 7px rgba(125,249,233,.35)",
                    }}
                  >
                    <icon-placeholder />
                    {sourceFile.name}
                  </button>
                )}
              </label>
            )}

            <label>
              <span className="mu">Topic</span>
              <input
                className="input"
                value={newSource.topic}
                onChange={(e) =>
                  setNewSource({
                    ...newSource,
                    topic: e.target.value,
                  })
                }
                placeholder="e.g. courses"
              />
            </label>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
              }}
            >
              <button
                type="button"
                className="btn sec"
                onClick={() => setShowAddSource(false)}
              >
                Cancel
              </button>

              <button type="submit" className="btn" disabled={savingSource}>
                {savingSource ? "Adding..." : "Add Source"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
