ALTER TABLE users
ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN verification_code_hash TEXT,
ADD COLUMN verification_expires_at TIMESTAMPTZ;