-- HAVANA NICE V2 · Add-only BOOK image derivatives. Original R2 keys never change.
-- A missing optimized key always means that the original is served.
ALTER TABLE book_pages ADD COLUMN optimized_key TEXT;
ALTER TABLE book_pages ADD COLUMN optimized_size_bytes INTEGER NOT NULL DEFAULT 0
 CHECK(optimized_size_bytes>=0 AND optimized_size_bytes<=5242880);
ALTER TABLE book_pages ADD COLUMN optimized_width INTEGER;
ALTER TABLE book_pages ADD COLUMN optimized_height INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS idx_book_optimized_key ON book_pages(optimized_key);
-- Grants are independent capabilities. Admin may request an original while
-- musician BOOK receives a WebP derivative when it exists.
ALTER TABLE book_media_grants ADD COLUMN variant TEXT NOT NULL DEFAULT 'original'
 CHECK(variant IN ('original','optimized'));
