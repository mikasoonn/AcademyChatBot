# Picsart Academy AI Chatbot (MVP)

React (Vite) frontend + Node (Express) backend. Dark neon design from the Figma file
(cyan/magenta, grid, corner brackets, terminal labels). Languages: ՀԱՅ / EN / РУ.

## Run (first time)

Requires Node 18+ and Docker Desktop (https://www.docker.com/products/docker-desktop). Start Docker Desktop first.

    npm run install:all                       # installs server/ and client/
    copy server\.env.example server\.env      # Windows   (Mac/Linux: cp server/.env.example server/.env)
    npm run db:up                             # starts PostgreSQL in Docker (port 5432)
    npm run db:setup                          # creates tables + demo data
    npm run dev                               # API on :4000, web on http://localhost:5173

Next times: start Docker Desktop, then `npm run db:up` and `npm run dev`.
Data lives in a Docker volume and survives restarts. Wipe everything: `docker compose down -v`.

## AI and the knowledge base

Pick ONE provider in `server/.env` (see `server/.env.example`). Never commit keys or paste them in chat.

- **Gemini (free tier, recommended for study):** key from https://aistudio.google.com ("Get API key"). `AI_PROVIDER=gemini`, `AI_API_KEY=...`. Free tiers have rate limits, and Google may use free-tier prompts to improve its products: do not test with real personal data.
- **Ollama (free, offline, runs on your computer):** `curl -fsSL https://ollama.com/install.sh | sh`, then `ollama pull llama3.1` (a smaller model such as `qwen2.5:3b` runs on weak machines). `AI_PROVIDER=openai`, `AI_BASE_URL=http://localhost:11434/v1`, `AI_MODEL=llama3.1`. Armenian quality of small local models is limited.
- **Groq / OpenRouter (free tiers):** `AI_PROVIDER=openai` with their `AI_BASE_URL`, key and a model name.
- **Anthropic Claude (paid API):** `AI_PROVIDER=anthropic`, `AI_API_KEY=...`.

Then fill the knowledge base from the real website (needs internet): `npm run kb:import` (home, contact and course pages, stored as Approved sources; re-run when the site changes) and restart `npm run dev`.

- Questions that are not bookings or private student data go to the AI, which answers only from the most relevant approved knowledge (`MAX_KB_CHARS`, default 20000), in the user's language.
- No provider configured, or the AI call fails: the bot falls back to the simple rules and offers "Connect to staff".
- Admin > Knowledge Base can also add a URL (picsartacademy.am pages only, see `KB_ALLOWED_HOSTS`) or pasted TXT. New sources start as "Needs approval".

## Updating an existing install

Copy the new `server/` and `client/src/` over your old ones (keep your `server/.env`), then run `npm run db:setup` once: it applies new migrations (safe to repeat; seed data is skipped if present), then restart `npm run dev`.

## Staff replies

Support Requests: Open shows the full conversation; staff can Take, Reply, Transfer or Resolve. A reply is stored in the conversation and appears in the user's chat within a few seconds (the chat polls after a hand-off). Admin and Staff also get the navigation inside the chat page.

## Demo accounts (password configured through SEED_PASSWORD)

| Role    | Email              | Sees                                                |
| ------- | ------------------ | --------------------------------------------------- |
| Student | student@academy.am | chat + own schedule / payments / attendance answers |
| Staff   | staff@academy.am   | Support Requests                                    |
| Admin   | admin@academy.am   | Users, Support Requests, Knowledge Base             |
| Guest   | (button on login)  | chat, courses and admission info, interview booking |

## How it fits the PRD

- Chat sidebar is the same for everyone (New chat + history). Role differences live in the chat and the dashboards.
- Applicants and students can book an interview inside the chat: slot, contact details, explicit confirm.
  Server creates the booking and a lead (Navigator CRM placeholder) with the conversation attached.
- Student-only answers (schedule, payments, attendance, excuse request) are authorised on the **server** (`server/bot.js`).
- The bot answers courses / admission only if an **Approved** Knowledge Base source covers the topic (table `kb_sources`).
  Unapproved sources are ignored. Anything else falls back to "connect to staff", which creates a Support Request.
- Knowledge Base: Admin only; PDF, DOCX, TXT, URL; new sources start as "Needs approval".

## What is mocked (replace next)

- Database: PostgreSQL (Docker), tables in `server/migrations/001_init.sql`. Add new changes as new numbered .sql files and run `npm --prefix server run migrate`.
- Seed users share the password configured through `SEED_PASSWORD` in `server/.env`. Never commit environment files or use demo credentials in production.
- `server/integrations.js`: Navigator CRM and Telegram stubs. Set `NAVIGATOR_CRM_URL`, `NAVIGATOR_CRM_TOKEN`,
  `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` and adapt the payloads. Slack and email are not wired yet.
- `server/bot.js`: keyword rules, used for booking, student-private answers and as the no-AI fallback. Everything else uses `server/ai.js`.
- Knowledge Base: URL and pasted-text sources work. PDF/DOCX upload and text extraction are not built yet (records only).
- Conversations, messages, bookings, support requests and an audit log are stored; there is no admin page for conversations or logs yet.
- Not built yet: Library search, excuse-request form, Interviews / Conversations / Reports / Logs admin pages,
  reschedule / cancel UI (the cancel endpoint exists), email verification, audit logs.

## Structure

    server/  index.js (API + roles)  bot.js  db.js  migrate.js  seed.js  migrations/  integrations.js

docker-compose.yml (local PostgreSQL)
client/ src/App.jsx (login, chat, admin) i18n.js api.js index.css
