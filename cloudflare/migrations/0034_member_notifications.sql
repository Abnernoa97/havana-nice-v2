-- HAVANA NICE V2 · private member notifications shared by Android and PWA.
-- Additive only; existing Chat, Calendar, Familia, R2 and sessions are untouched.
CREATE TABLE IF NOT EXISTS member_notifications (
 id TEXT PRIMARY KEY NOT NULL,
 recipient_id TEXT NOT NULL REFERENCES chat_members(actor_id) ON DELETE CASCADE,
 actor_id TEXT NOT NULL REFERENCES chat_members(actor_id) ON DELETE CASCADE,
 kind TEXT NOT NULL,
 target_id TEXT NOT NULL,
 emoji TEXT NOT NULL DEFAULT '',
 preview TEXT NOT NULL DEFAULT '',
 created_at INTEGER NOT NULL,
 read_at INTEGER,
 dedupe_key TEXT UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_member_notifications_inbox
 ON member_notifications(recipient_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_member_notifications_unread
 ON member_notifications(recipient_id,read_at);
