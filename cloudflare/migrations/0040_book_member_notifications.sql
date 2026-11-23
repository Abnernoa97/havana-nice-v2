-- HAVANA NICE V2 · General BOOK 3D notifications use a separate actorless
-- system inbox so the existing repertoire table CHECK constraint stays intact.
-- No changes to BOOK media, page order, PageFlip engine, or older notifications.
CREATE TABLE IF NOT EXISTS book_member_notifications (
 id TEXT PRIMARY KEY NOT NULL,
 recipient_id TEXT NOT NULL REFERENCES chat_members(actor_id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('book.updated')),
 target_id TEXT NOT NULL,
 preview TEXT NOT NULL DEFAULT '',
 created_at INTEGER NOT NULL,
 read_at INTEGER,
 dedupe_key TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_book_member_notices_inbox
 ON book_member_notifications(recipient_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_book_member_notices_unread
 ON book_member_notifications(recipient_id,read_at);
