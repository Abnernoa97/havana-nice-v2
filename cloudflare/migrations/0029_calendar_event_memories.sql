-- HAVANA NICE V2 · private illustrated memories for past Calendar events.
-- Separate records, one existing private R2 bucket, same BOOK page-flip engine.
CREATE TABLE IF NOT EXISTS calendar_event_photos (
 id TEXT PRIMARY KEY NOT NULL,
 event_id TEXT NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
 object_key TEXT NOT NULL UNIQUE,
 mime_type TEXT NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/webp','image/heic','image/heif')),
 size_bytes INTEGER NOT NULL CHECK(size_bytes>0 AND size_bytes<=15728640),
 optimized_key TEXT UNIQUE,
 optimized_size_bytes INTEGER NOT NULL DEFAULT 0 CHECK(optimized_size_bytes>=0 AND optimized_size_bytes<=5242880),
 optimized_width INTEGER,
 optimized_height INTEGER,
 position INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_calendar_photos_event ON calendar_event_photos(event_id,position,created_at,id);
CREATE TABLE IF NOT EXISTS calendar_photo_grants (
 token_hash TEXT PRIMARY KEY NOT NULL,
 photo_id TEXT NOT NULL REFERENCES calendar_event_photos(id) ON DELETE CASCADE,
 actor_id TEXT,
 admin_only INTEGER NOT NULL DEFAULT 0 CHECK(admin_only IN (0,1)),
 variant TEXT NOT NULL DEFAULT 'original' CHECK(variant IN ('original','optimized')),
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_calendar_photo_grants_expiry ON calendar_photo_grants(expires_at);
CREATE TABLE IF NOT EXISTS calendar_photo_delete_queue (
 object_key TEXT PRIMARY KEY NOT NULL,
 size_bytes INTEGER NOT NULL CHECK(size_bytes>0),
 queued_at TEXT NOT NULL
);
