-- HAVANA NICE V2 · private system notices from the existing Calendar.
-- Additive only. The existing member_notifications actor foreign key and all
-- historic Chat, Story, D1 and R2 data remain unchanged.
CREATE TABLE IF NOT EXISTS calendar_member_notifications (
 id TEXT PRIMARY KEY NOT NULL,
 recipient_id TEXT NOT NULL REFERENCES chat_members(actor_id) ON DELETE CASCADE,
 kind TEXT NOT NULL DEFAULT 'calendar.event' CHECK(kind='calendar.event'),
 target_id TEXT NOT NULL,
 preview TEXT NOT NULL DEFAULT '',
 created_at INTEGER NOT NULL,
 read_at INTEGER,
 dedupe_key TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_calendar_member_notices_inbox
 ON calendar_member_notifications(recipient_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_calendar_member_notices_unread
 ON calendar_member_notifications(recipient_id,read_at);
