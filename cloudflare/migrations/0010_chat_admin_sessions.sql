-- HAVANA NICE V2 — staged, additive administrative sessions. No existing Chat row is changed.
-- Deploy before enabling administrator login. All credentials stored as SHA-256 digests.
CREATE TABLE IF NOT EXISTS chat_admin_sessions (
 token_hash TEXT PRIMARY KEY NOT NULL,
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_chat_admin_sessions_expiry ON chat_admin_sessions(expires_at);
CREATE TABLE IF NOT EXISTS chat_admin_login_limits (
 client_hash TEXT PRIMARY KEY NOT NULL,
 window_start INTEGER NOT NULL,
 failures INTEGER NOT NULL DEFAULT 0 CHECK(failures>=0)
);
