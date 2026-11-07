-- HAVANA NICE V2: attachments for the same ChatRoom, in the sole private R2 bucket.
-- Additive; keeps all existing text messages and Family media intact.
CREATE TABLE IF NOT EXISTS chat_media_objects (
 id TEXT PRIMARY KEY NOT NULL,
 sender_id TEXT NOT NULL REFERENCES chat_members(actor_id),
 object_key TEXT NOT NULL UNIQUE,
 kind TEXT NOT NULL CHECK(kind IN ('photo','video')),
 mime_type TEXT NOT NULL,
 size_bytes INTEGER NOT NULL CHECK(size_bytes>0 AND size_bytes<=9500000000),
 original_name TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL CHECK(status IN ('pending','ready','aborted')),
 multipart_upload_id TEXT,
 message_seq INTEGER UNIQUE REFERENCES chat_messages(seq) ON DELETE SET NULL,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS chat_media_sender_status ON chat_media_objects(sender_id,status,created_at);
CREATE INDEX IF NOT EXISTS chat_media_message ON chat_media_objects(message_seq);
CREATE TABLE IF NOT EXISTS chat_media_parts (
 media_id TEXT NOT NULL REFERENCES chat_media_objects(id) ON DELETE CASCADE,
 part_number INTEGER NOT NULL CHECK(part_number>=1 AND part_number<=2000),
 etag TEXT NOT NULL,
 size_bytes INTEGER NOT NULL CHECK(size_bytes>0),
 PRIMARY KEY(media_id,part_number)
);
CREATE TABLE IF NOT EXISTS chat_media_grants (
 token_hash TEXT PRIMARY KEY NOT NULL,
 media_id TEXT NOT NULL REFERENCES chat_media_objects(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS chat_media_grants_expiry ON chat_media_grants(expires_at);
