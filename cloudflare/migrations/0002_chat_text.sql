-- CHAT 1: only text, isolated V2 D1. Keeps foundation schema marker stable.
CREATE TABLE IF NOT EXISTS chat_messages (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  client_message_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 2000),
  created_at TEXT NOT NULL,
  UNIQUE (sender_id, client_message_id)
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at, seq);
INSERT INTO system_meta (key, value) VALUES ('chat_schema', 'chat-text-v1')
ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now');
