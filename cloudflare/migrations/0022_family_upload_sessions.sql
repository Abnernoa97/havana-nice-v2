-- Isolated, expiring private R2 multipart transfers for large Familia videos.
-- Does not alter family_media, Chat, Calendar, member sessions or previous migrations.
CREATE TABLE IF NOT EXISTS family_upload_sessions (
 id TEXT PRIMARY KEY NOT NULL,
 actor_id TEXT NOT NULL REFERENCES chat_members(actor_id) ON DELETE CASCADE,
 object_key TEXT NOT NULL UNIQUE,
 upload_id TEXT NOT NULL,
 mime_type TEXT NOT NULL CHECK(mime_type IN ('video/mp4','video/quicktime')),
 size_bytes INTEGER NOT NULL CHECK(size_bytes>0 AND size_bytes<=83886080),
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_family_upload_sessions_expiry ON family_upload_sessions(expires_at);
CREATE TABLE IF NOT EXISTS family_upload_parts (
 session_id TEXT NOT NULL REFERENCES family_upload_sessions(id) ON DELETE CASCADE,
 part_number INTEGER NOT NULL CHECK(part_number>0 AND part_number<=16),
 etag TEXT NOT NULL,
 size_bytes INTEGER NOT NULL CHECK(size_bytes>0 AND size_bytes<=5242880),
 PRIMARY KEY(session_id,part_number)
);
