-- Rebuild the small 24h reaction table once to add laughing faces, preserving
-- every already-recorded heart and clap. No Chat or Profile table is touched.
CREATE TABLE member_story_reactions_next (
 story_id TEXT NOT NULL REFERENCES member_stories(id) ON DELETE CASCADE,
 actor_id TEXT NOT NULL REFERENCES chat_members(actor_id) ON DELETE CASCADE,
 emoji TEXT NOT NULL CHECK(emoji IN ('❤️','👏','😂')),
 count INTEGER NOT NULL DEFAULT 1 CHECK(count BETWEEN 1 AND 200),
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(story_id,actor_id,emoji)
);
INSERT INTO member_story_reactions_next(story_id,actor_id,emoji,count,updated_at)
 SELECT story_id,actor_id,emoji,count,updated_at FROM member_story_reactions;
DROP TABLE member_story_reactions;
ALTER TABLE member_story_reactions_next RENAME TO member_story_reactions;
CREATE INDEX idx_member_story_reactions_story ON member_story_reactions(story_id,emoji);
