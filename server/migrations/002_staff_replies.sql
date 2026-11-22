-- staff can reply inside a conversation; each conversation gets a secret token so only its owner can read staff replies
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_role_check;
ALTER TABLE messages ADD CONSTRAINT messages_role_check CHECK (role IN ('user','bot','staff'));
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS token UUID NOT NULL DEFAULT gen_random_uuid();
