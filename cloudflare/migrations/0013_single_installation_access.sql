-- HAVANA NICE V2: one musician name, one registered installation.
-- Additive migration: all existing musicians remain LEGACY (0) so their
-- already-installed Android/iPhone clients are not disconnected by the rollout.
-- Members created after activating the new Admin server will opt in to mode=1.
ALTER TABLE chat_members ADD COLUMN single_device_mode INTEGER NOT NULL DEFAULT 0
 CHECK(single_device_mode IN (0,1));

-- A first successful named login records the *hash of that very session* as
-- the only permitted installation credential. No password, phone fingerprint,
-- IP address or personally identifying device serial is needed.
CREATE TABLE IF NOT EXISTS chat_single_device_owners (
 actor_id TEXT PRIMARY KEY NOT NULL REFERENCES chat_members(actor_id) ON DELETE CASCADE,
 token_hash TEXT NOT NULL UNIQUE,
 linked_at INTEGER NOT NULL
);

-- Administrator-only duplicate-attempt audit. No tokens or IP addresses.
CREATE TABLE IF NOT EXISTS chat_duplicate_login_alerts (
 id TEXT PRIMARY KEY NOT NULL,
 actor_id TEXT NOT NULL REFERENCES chat_members(actor_id) ON DELETE CASCADE,
 attempted_at INTEGER NOT NULL,
 platform TEXT NOT NULL,
 operating_system TEXT NOT NULL,
 device_name TEXT NOT NULL,
 reviewed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_duplicate_login_alerts_recent
 ON chat_duplicate_login_alerts(attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_duplicate_login_alerts_member
 ON chat_duplicate_login_alerts(actor_id,attempted_at DESC);
