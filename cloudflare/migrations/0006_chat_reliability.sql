-- HAVANA NICE V2 — isolated Chat reliability and conversation controls.
-- Text deletion is soft so replies, sequence ordering, and read markers survive.
ALTER TABLE chat_messages ADD COLUMN edited_at TEXT;
ALTER TABLE chat_messages ADD COLUMN deleted_at TEXT;
CREATE TABLE IF NOT EXISTS chat_read_receipts (
  actor_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  last_read_seq INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS chat_messages_sender_seq ON chat_messages(sender_id,seq);
CREATE INDEX IF NOT EXISTS chat_messages_created_seq ON chat_messages(seq);
