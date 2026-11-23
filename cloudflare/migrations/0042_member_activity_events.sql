-- Authenticated module visits and actually started audio playback only.
-- No message bodies, IP addresses, image URLs or user input recorded.
CREATE TABLE IF NOT EXISTS member_activity_events (
 id TEXT PRIMARY KEY NOT NULL,
 actor_id TEXT NOT NULL REFERENCES chat_members(actor_id) ON DELETE CASCADE,
 event_type TEXT NOT NULL CHECK(event_type IN ('module.open','audio.play')),
 target_id TEXT NOT NULL,
 detail TEXT NOT NULL DEFAULT '',
 occurred_at INTEGER NOT NULL,
 platform TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_member_activity_by_actor ON member_activity_events(actor_id,occurred_at DESC);
