-- Preventive audit 2026-10-26 — V2 only.
-- chat_messages.seq is INTEGER PRIMARY KEY AUTOINCREMENT, which already
-- has SQLite's built-in rowid B-tree index.
-- An extra explicit index on seq duplicates that structure and adds write work.
-- Do not touch legacy HAVANA NICE or change any message row.
DROP INDEX IF EXISTS chat_messages_created_seq;
