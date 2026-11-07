-- HAVANA NICE V2 — canonical single-installation policy.
-- All existing members already have mode=1; owner uniqueness is enforced by
-- chat_single_device_owners and the Worker for every new and existing name.
-- Remove the old 0/1 compatibility flag entirely. No user, token, or message
-- is modified by this schema-only migration.
ALTER TABLE chat_members DROP COLUMN single_device_mode;
