-- Isolated social profile avatar: one photo per authorized musician.
-- No changes to session, Chat, Familia or BOOK objects.
CREATE TABLE IF NOT EXISTS member_profiles (
 actor_id TEXT PRIMARY KEY NOT NULL REFERENCES chat_members(actor_id) ON DELETE CASCADE,
 photo_key TEXT NOT NULL UNIQUE,
 photo_size INTEGER NOT NULL CHECK(photo_size>0 AND photo_size<=1500000),
 updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS member_profile_grants (
 token_hash TEXT PRIMARY KEY NOT NULL,
 actor_id TEXT NOT NULL REFERENCES chat_members(actor_id) ON DELETE CASCADE,
 photo_key TEXT NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_member_profile_grants_expiry ON member_profile_grants(expires_at);
