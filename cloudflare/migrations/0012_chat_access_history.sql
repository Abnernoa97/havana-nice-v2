-- Access audit begins at deployment, never backfill invented device metadata.
-- Removing a musician also deletes their access history.
CREATE TABLE IF NOT EXISTS chat_access_events (
 id TEXT PRIMARY KEY NOT NULL,
 actor_id TEXT NOT NULL,
 event_type TEXT NOT NULL CHECK(event_type IN ('login','connect','disconnect')),
 occurred_at INTEGER NOT NULL,
 platform TEXT NOT NULL,
 operating_system TEXT NOT NULL,
 device_name TEXT NOT NULL,
 device_model TEXT,
 CHECK(length(platform) <= 40),
 CHECK(length(operating_system) <= 80),
 CHECK(length(device_name) <= 80),
 CHECK(device_model IS NULL OR length(device_model) <= 100)
);
CREATE INDEX IF NOT EXISTS idx_chat_access_actor_time
 ON chat_access_events(actor_id,occurred_at DESC);
