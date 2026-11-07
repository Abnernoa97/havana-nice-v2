-- HAVANA NICE V2 · BOOK is an isolated editorial magazine, not a Familia album.
-- Pages have their own R2 keys, private grants, editorial order and publication flag.
CREATE TABLE IF NOT EXISTS book_pages (
 id TEXT PRIMARY KEY NOT NULL,
 object_key TEXT NOT NULL UNIQUE,
 mime_type TEXT NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/webp','image/heic','image/heif')),
 size_bytes INTEGER NOT NULL CHECK(size_bytes>0 AND size_bytes<=15728640),
 position INTEGER NOT NULL DEFAULT 0,
 published INTEGER NOT NULL DEFAULT 1 CHECK(published IN (0,1)),
 fit TEXT NOT NULL DEFAULT 'cover' CHECK(fit IN ('cover','contain')),
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_book_pages_order ON book_pages(published,position,created_at,id);
CREATE TABLE IF NOT EXISTS book_media_grants (
 token_hash TEXT PRIMARY KEY NOT NULL,
 page_id TEXT NOT NULL REFERENCES book_pages(id) ON DELETE CASCADE,
 admin_only INTEGER NOT NULL DEFAULT 0 CHECK(admin_only IN (0,1)),
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_book_media_grants_expiry ON book_media_grants(expires_at);
-- Safe two-phase R2 removal: pages disappear from D1 first; failed object deletion remains retryable.
CREATE TABLE IF NOT EXISTS book_delete_queue (
 object_key TEXT PRIMARY KEY NOT NULL,
 size_bytes INTEGER NOT NULL CHECK(size_bytes>0),
 queued_at TEXT NOT NULL
);
