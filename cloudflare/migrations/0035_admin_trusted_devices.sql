-- Passwordless return on a specifically paired browser.
-- Registration requires existing Administrator authorization once; existing
-- admin password/session handling is unchanged and remains the recovery path.
CREATE TABLE IF NOT EXISTS chat_admin_trusted_devices (
 id TEXT PRIMARY KEY NOT NULL,
 public_jwk TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 last_used_at INTEGER,
 revoked_at INTEGER
);
CREATE TABLE IF NOT EXISTS chat_admin_device_challenges (
 id TEXT PRIMARY KEY NOT NULL,
 device_id TEXT NOT NULL REFERENCES chat_admin_trusted_devices(id) ON DELETE CASCADE,
 challenge_hash TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 used_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_admin_device_challenge_expiry ON chat_admin_device_challenges(expires_at);
