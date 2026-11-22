-- HAVANA NICE V2 · one private Push Center for Android FCM and standards Web Push.
-- Additive to existing member_notifications/calendar_member_notifications.
-- Do not change Chat, BOOK, Audio, sessions, or the existing Durable Objects.
CREATE TABLE IF NOT EXISTS member_push_devices (
 id TEXT PRIMARY KEY NOT NULL,
 actor_id TEXT NOT NULL REFERENCES chat_members(actor_id) ON DELETE CASCADE,
 platform TEXT NOT NULL CHECK(platform IN ('webpush','android-fcm')),
 token_hash TEXT NOT NULL UNIQUE,
 endpoint TEXT NOT NULL,
 p256dh TEXT,
 auth_secret TEXT,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 revoked_at INTEGER,
 last_success_at INTEGER,
 last_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_member_push_devices_owner
 ON member_push_devices(actor_id,revoked_at,updated_at DESC);

-- Per-notice/per-device delivery ledger: persisted even when a device is offline.
-- Unique key prevents duplicate sends when the same Chat/Story event retries.
CREATE TABLE IF NOT EXISTS member_push_outbox (
 id TEXT PRIMARY KEY NOT NULL,
 notice_id TEXT NOT NULL,
 device_id TEXT NOT NULL REFERENCES member_push_devices(id) ON DELETE CASCADE,
 recipient_id TEXT NOT NULL REFERENCES chat_members(actor_id) ON DELETE CASCADE,
 kind TEXT NOT NULL,
 target_id TEXT NOT NULL,
 title TEXT NOT NULL,
 body TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 tries INTEGER NOT NULL DEFAULT 0,
 next_attempt_at INTEGER NOT NULL,
 delivered_at INTEGER,
 abandoned_at INTEGER,
 last_error TEXT,
 UNIQUE(notice_id,device_id)
);
CREATE INDEX IF NOT EXISTS idx_member_push_outbox_due
 ON member_push_outbox(next_attempt_at,id) WHERE delivered_at IS NULL AND abandoned_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_member_push_outbox_recipient
 ON member_push_outbox(recipient_id,created_at DESC);
