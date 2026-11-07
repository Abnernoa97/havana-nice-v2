-- HAVANA NICE V2 · One canonical private Familia budget, not a second gallery.
-- SQLite/D1 cannot DROP CHECK constraints; rebuild only the two V2 media tables.
-- Preserve every original, private grant and in-flight part through the rebuild.
PRAGMA defer_foreign_keys=ON;

CREATE TABLE family_grants_0024 AS SELECT token_hash,media_id,expires_at,variant FROM family_media_grants;
CREATE TABLE family_media_0024 (
 id TEXT PRIMARY KEY NOT NULL,
 actor_id TEXT NOT NULL REFERENCES chat_members(actor_id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('photo','video')),
 object_key TEXT NOT NULL UNIQUE,
 mime_type TEXT NOT NULL,
 size_bytes INTEGER NOT NULL CHECK(size_bytes>0 AND size_bytes<=9500000000),
 position INTEGER NOT NULL DEFAULT 0,
 is_cover INTEGER NOT NULL DEFAULT 0 CHECK(is_cover IN (0,1)),
 created_at TEXT NOT NULL,
 poster_key TEXT,
 poster_mime TEXT CHECK(poster_mime IN ('image/webp','image/jpeg')),
 poster_size_bytes INTEGER NOT NULL DEFAULT 0 CHECK(poster_size_bytes>=0 AND poster_size_bytes<=393216)
);
INSERT INTO family_media_0024
 (id,actor_id,kind,object_key,mime_type,size_bytes,position,is_cover,created_at,poster_key,poster_mime)
 SELECT id,actor_id,kind,object_key,mime_type,size_bytes,position,is_cover,created_at,poster_key,poster_mime
 FROM family_media;
DROP TABLE family_media;
ALTER TABLE family_media_0024 RENAME TO family_media;
CREATE INDEX idx_family_media_member ON family_media(actor_id,position,created_at,id);
INSERT INTO family_media_grants(token_hash,media_id,expires_at,variant)
 SELECT token_hash,media_id,expires_at,variant FROM family_grants_0024;
DROP TABLE family_grants_0024;

CREATE TABLE family_parts_0024 AS SELECT session_id,part_number,etag,size_bytes FROM family_upload_parts;
CREATE TABLE family_upload_sessions_0024 (
 id TEXT PRIMARY KEY NOT NULL,
 actor_id TEXT NOT NULL REFERENCES chat_members(actor_id) ON DELETE CASCADE,
 object_key TEXT NOT NULL UNIQUE,
 upload_id TEXT NOT NULL,
 mime_type TEXT NOT NULL CHECK(mime_type IN ('video/mp4','video/quicktime','image/jpeg','image/png','image/webp','image/heic','image/heif')),
 size_bytes INTEGER NOT NULL CHECK(size_bytes>0 AND size_bytes<=9500000000),
 expires_at INTEGER NOT NULL
);
INSERT INTO family_upload_sessions_0024 SELECT * FROM family_upload_sessions;
DROP TABLE family_upload_sessions;
ALTER TABLE family_upload_sessions_0024 RENAME TO family_upload_sessions;
CREATE INDEX idx_family_upload_sessions_expiry ON family_upload_sessions(expires_at);
DROP TABLE family_upload_parts;
CREATE TABLE family_upload_parts (
 session_id TEXT NOT NULL REFERENCES family_upload_sessions(id) ON DELETE CASCADE,
 part_number INTEGER NOT NULL CHECK(part_number>0 AND part_number<=2000),
 etag TEXT NOT NULL,
 size_bytes INTEGER NOT NULL CHECK(size_bytes>0 AND size_bytes<=5242880),
 PRIMARY KEY(session_id,part_number)
);
INSERT INTO family_upload_parts(session_id,part_number,etag,size_bytes)
 SELECT session_id,part_number,etag,size_bytes FROM family_parts_0024;
DROP TABLE family_parts_0024;

-- Atomic reservations protect the global limit during simultaneous small uploads.
CREATE TABLE family_upload_reservations (
 id TEXT PRIMARY KEY NOT NULL,
 size_bytes INTEGER NOT NULL CHECK(size_bytes>0 AND size_bytes<=9500000000),
 expires_at INTEGER NOT NULL
);
CREATE INDEX idx_family_upload_reservations_expiry ON family_upload_reservations(expires_at);
