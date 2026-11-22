-- HAVANA NICE V2 · system-origin activity, not a forged musician's action.
-- Additive; Chat, Calendar, Repertoire and existing notification history remain unchanged.
CREATE TABLE IF NOT EXISTS member_system_notifications (
 id TEXT PRIMARY KEY NOT NULL,
 recipient_id TEXT NOT NULL REFERENCES chat_members(actor_id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('repertoire.updated')),
 target_id TEXT NOT NULL,
 preview TEXT NOT NULL DEFAULT '',
 created_at INTEGER NOT NULL,
 read_at INTEGER,
 dedupe_key TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_member_system_notices_inbox
 ON member_system_notifications(recipient_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_member_system_notices_unread
 ON member_system_notifications(recipient_id,read_at);
