-- HAVANA NICE V2: private Familia media. No changes to Chat, Calendar, access or Repertoire.
-- Each object is stored in the one private R2 bucket and indexed in canonical D1.
CREATE TABLE IF NOT EXISTS family_media (
 id TEXT PRIMARY KEY NOT NULL,
 actor_id TEXT NOT NULL REFERENCES chat_members(actor_id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('photo','video')),
 object_key TEXT NOT NULL UNIQUE,
 mime_type TEXT NOT NULL,
 size_bytes INTEGER NOT NULL CHECK(size_bytes>0 AND size_bytes<=83886080),
 position INTEGER NOT NULL DEFAULT 0,
 is_cover INTEGER NOT NULL DEFAULT 0 CHECK(is_cover IN (0,1)),
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_family_media_member ON family_media(actor_id,position,created_at,id);
-- Capability grants are opaque hashes, short-lived and never reusable across objects.
CREATE TABLE IF NOT EXISTS family_media_grants (
 token_hash TEXT PRIMARY KEY NOT NULL,
 media_id TEXT NOT NULL REFERENCES family_media(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_family_media_grants_expiry ON family_media_grants(expires_at);
