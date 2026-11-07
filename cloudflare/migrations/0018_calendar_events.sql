-- HAVANA NICE V2 Calendar. No Chat data, tokens or access ownership are changed.
-- The migration is additive and was NOT previously applied to the V2 D1.
CREATE TABLE IF NOT EXISTS calendar_events (
 id TEXT PRIMARY KEY NOT NULL,
 event_date TEXT NOT NULL,
 time_zone TEXT NOT NULL DEFAULT 'America/Mexico_City',
 title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
 venue TEXT NOT NULL DEFAULT '' CHECK(length(venue)<=160),
 city TEXT NOT NULL DEFAULT '' CHECK(length(city)<=120),
 call_time TEXT,
 soundcheck_time TEXT,
 arrival_time TEXT,
 show_time TEXT,
 end_time TEXT,
 wardrobe TEXT NOT NULL DEFAULT '' CHECK(length(wardrobe)<=500),
 details TEXT NOT NULL DEFAULT '' CHECK(length(details)<=4000),
 contact_name TEXT NOT NULL DEFAULT '' CHECK(length(contact_name)<=160),
 contact_phone TEXT NOT NULL DEFAULT '' CHECK(length(contact_phone)<=80),
 notes TEXT NOT NULL DEFAULT '' CHECK(length(notes)<=4000),
 map_url TEXT NOT NULL DEFAULT '' CHECK(length(map_url)<=1500),
 status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('tentative','confirmed','cancelled')),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
 revision_token TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON calendar_events(event_date,id);
CREATE TABLE IF NOT EXISTS calendar_event_recipients (
 event_id TEXT NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
 actor_id TEXT NOT NULL REFERENCES chat_members(actor_id) ON DELETE CASCADE,
 PRIMARY KEY(event_id,actor_id)
);
CREATE INDEX IF NOT EXISTS idx_calendar_recipients_actor ON calendar_event_recipients(actor_id,event_id);
