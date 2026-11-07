-- HAVANA NICE V2: preserve the administrator's freeform date and status.
-- Date remains original editable text in event_date; date_sort is optional derived
-- YYYY-MM-DD only for stable chronological order. No Chat table is changed.
ALTER TABLE calendar_events ADD COLUMN date_sort TEXT;
ALTER TABLE calendar_events ADD COLUMN status_text TEXT NOT NULL DEFAULT '';
UPDATE calendar_events SET date_sort=event_date
 WHERE event_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]';
CREATE INDEX IF NOT EXISTS idx_calendar_date_sort ON calendar_events(date_sort,event_date,id);
