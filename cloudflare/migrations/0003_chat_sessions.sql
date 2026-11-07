-- CHAT 1 lab-only opaque sessions. Only SHA-256 of token is retained.
CREATE TABLE IF NOT EXISTS chat_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  actor_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_expiration ON chat_sessions(expires_at);
