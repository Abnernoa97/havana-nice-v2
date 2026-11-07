-- Consolidated Chat 3-5 V2 laboratory schema. Production untouched.
ALTER TABLE chat_messages ADD COLUMN reply_to_seq INTEGER REFERENCES chat_messages(seq);
CREATE TABLE IF NOT EXISTS chat_reactions (
  message_seq INTEGER NOT NULL REFERENCES chat_messages(seq),
  actor_id TEXT NOT NULL,
  emoji TEXT NOT NULL CHECK (emoji IN ('❤️', '😂', '👍')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (message_seq, actor_id, emoji)
);
CREATE INDEX IF NOT EXISTS chat_reactions_message ON chat_reactions(message_seq);
INSERT INTO system_meta(key,value) VALUES('chat_features','text-replies-reactions-presence-v1')
  ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=datetime('now');
