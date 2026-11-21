-- Isolated, ephemeral photo stories: visibility expires EXACTLY 24h after upload.
-- No profile, Chat, Family or Calendar schema changes.
CREATE TABLE IF NOT EXISTS member_stories (
 id TEXT PRIMARY KEY NOT NULL,
 actor_id TEXT NOT NULL REFERENCES chat_members(actor_id) ON DELETE CASCADE,
 object_key TEXT NOT NULL UNIQUE,
 byte_size INTEGER NOT NULL CHECK(byte_size>0 AND byte_size<=1500000),
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL CHECK(expires_at=created_at+86400000)
);
CREATE INDEX IF NOT EXISTS idx_member_stories_expiry ON member_stories(expires_at,created_at);
CREATE INDEX IF NOT EXISTS idx_member_stories_actor ON member_stories(actor_id,expires_at);
CREATE TABLE IF NOT EXISTS member_story_grants (
 token_hash TEXT PRIMARY KEY NOT NULL,
 story_id TEXT NOT NULL REFERENCES member_stories(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_member_story_grants_expiry ON member_story_grants(expires_at);
