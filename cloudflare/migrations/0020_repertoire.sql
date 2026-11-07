-- V2 Repertoire: separate from Chat, sessions and Calendar writes.
CREATE TABLE IF NOT EXISTS repertoire_songs(
 id TEXT PRIMARY KEY NOT NULL,
 title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 180),
 artist TEXT NOT NULL DEFAULT '' CHECK(length(artist)<=180),
 category TEXT NOT NULL DEFAULT 'ENGLISH' CHECK(length(category) BETWEEN 1 AND 80),
 position INTEGER NOT NULL DEFAULT 0,
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 reference_url TEXT NOT NULL DEFAULT '' CHECK(length(reference_url)<=1500),
 version INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_repertoire_category_position ON repertoire_songs(category,position,title);
CREATE TABLE IF NOT EXISTS repertoire_event_items(
 id TEXT PRIMARY KEY NOT NULL,
 event_id TEXT NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
 song_id TEXT REFERENCES repertoire_songs(id) ON DELETE SET NULL,
 title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 180),
 artist TEXT NOT NULL DEFAULT '' CHECK(length(artist)<=180),
 reference_url TEXT NOT NULL DEFAULT '' CHECK(length(reference_url)<=1500),
 position INTEGER NOT NULL DEFAULT 0,
 completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1)),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(event_id,song_id)
);
CREATE INDEX IF NOT EXISTS idx_rep_items_event_position ON repertoire_event_items(event_id,position,id);
