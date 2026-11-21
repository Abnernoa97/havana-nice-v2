-- HAVANA NICE V2 · public-to-the-team conversations attached to each ephemeral state.
-- Independent of Chat messages, reactions, offline outbox, profile and Calendar.
-- All comments/reactions disappear with their state after exactly 24h.
CREATE TABLE IF NOT EXISTS member_story_comments (
 id TEXT PRIMARY KEY NOT NULL,
 story_id TEXT NOT NULL REFERENCES member_stories(id) ON DELETE CASCADE,
 actor_id TEXT NOT NULL REFERENCES chat_members(actor_id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('text','voice')),
 body TEXT NOT NULL DEFAULT '',
 voice_key TEXT UNIQUE,
 voice_mime TEXT,
 voice_size INTEGER,
 created_at INTEGER NOT NULL,
 CHECK((kind='text' AND length(trim(body)) BETWEEN 1 AND 500 AND voice_key IS NULL)
    OR (kind='voice' AND length(body)=0 AND voice_key IS NOT NULL
      AND voice_mime IN ('audio/mp4','audio/webm','audio/ogg')
      AND voice_size BETWEEN 1 AND 3000000))
);
CREATE INDEX IF NOT EXISTS idx_member_story_comments_story
 ON member_story_comments(story_id,created_at,id);
CREATE INDEX IF NOT EXISTS idx_member_story_comments_actor
 ON member_story_comments(actor_id,created_at);
CREATE TABLE IF NOT EXISTS member_story_voice_grants (
 token_hash TEXT PRIMARY KEY NOT NULL,
 comment_id TEXT NOT NULL REFERENCES member_story_comments(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_member_story_voice_grants_expiry
 ON member_story_voice_grants(expires_at);
CREATE TABLE IF NOT EXISTS member_story_reactions (
 story_id TEXT NOT NULL REFERENCES member_stories(id) ON DELETE CASCADE,
 actor_id TEXT NOT NULL REFERENCES chat_members(actor_id) ON DELETE CASCADE,
 emoji TEXT NOT NULL CHECK(emoji IN ('❤️','👏')),
 count INTEGER NOT NULL DEFAULT 1 CHECK(count BETWEEN 1 AND 200),
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(story_id,actor_id,emoji)
);
CREATE INDEX IF NOT EXISTS idx_member_story_reactions_story
 ON member_story_reactions(story_id,emoji);
