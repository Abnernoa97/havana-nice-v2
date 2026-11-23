-- Existing trusted devices stay paired; only bearer-token liveness changes.
ALTER TABLE chat_admin_sessions ADD COLUMN last_seen_at INTEGER;
UPDATE chat_admin_sessions SET last_seen_at=CAST(strftime('%s','now') AS INTEGER)*1000
 WHERE revoked_at IS NULL AND expires_at>CAST(strftime('%s','now') AS INTEGER)*1000;
CREATE INDEX IF NOT EXISTS idx_chat_admin_sessions_presence ON chat_admin_sessions(last_seen_at);
