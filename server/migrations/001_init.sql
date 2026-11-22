CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student','staff','admin')),
  disabled BOOLEAN NOT NULL DEFAULT false,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Only status 'Approved' sources are used by the chatbot. content = extracted text (filled in the next step).
CREATE TABLE kb_sources (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('PDF','DOCX','TXT','URL')),
  topic TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL DEFAULT 'Needs approval' CHECK (status IN ('Needs approval','Approved')),
  content TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE conversations (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  lang TEXT NOT NULL DEFAULT 'en',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE messages (
  id SERIAL PRIMARY KEY,
  conversation_id INT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','bot')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE bookings (
  id SERIAL PRIMARY KEY,
  conversation_id INT REFERENCES conversations(id),
  slot_date DATE NOT NULL,
  slot_time TEXT NOT NULL,
  name TEXT NOT NULL, surname TEXT, email TEXT NOT NULL, phone TEXT,
  cancelled BOOLEAN NOT NULL DEFAULT false,
  lead_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX bookings_slot_once ON bookings (slot_date, slot_time) WHERE NOT cancelled;
CREATE TABLE support_requests (
  id SERIAL PRIMARY KEY,
  conversation_id INT REFERENCES conversations(id),
  from_name TEXT NOT NULL,
  topic TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'New' CHECK (status IN ('New','In progress','Resolved','Transferred')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  action TEXT NOT NULL,
  target TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
