-- HAVANA NICE V2 · audio de la banda: catálogo privado, arte y playback.
-- Aditivo; no modifica medios del Chat, BOOK, Familia ni Calendario.
CREATE TABLE IF NOT EXISTS audio_tracks (
 id TEXT PRIMARY KEY NOT NULL,
 title TEXT NOT NULL,
 artist TEXT NOT NULL DEFAULT 'HAVANA NICE',
 album TEXT NOT NULL DEFAULT 'HAVANA NICE',
 object_key TEXT NOT NULL UNIQUE,
 mime_type TEXT NOT NULL,
 size_bytes INTEGER NOT NULL CHECK(size_bytes>0),
 cover_key TEXT,
 cover_mime TEXT,
 cover_size_bytes INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL,
 position INTEGER NOT NULL DEFAULT 0,
 published INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_audio_tracks_published ON audio_tracks(published,position,created_at);
CREATE TABLE IF NOT EXISTS audio_media_grants (
 token_hash TEXT PRIMARY KEY NOT NULL,
 track_id TEXT NOT NULL REFERENCES audio_tracks(id) ON DELETE CASCADE,
 variant TEXT NOT NULL CHECK(variant IN ('audio','cover')),
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audio_media_grants_expiry ON audio_media_grants(expires_at);
CREATE TABLE IF NOT EXISTS audio_delete_queue (
 object_key TEXT PRIMARY KEY NOT NULL,
 size_bytes INTEGER NOT NULL DEFAULT 0,
 queued_at INTEGER NOT NULL
);
