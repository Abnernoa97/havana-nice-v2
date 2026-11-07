-- HAVANA NICE V2: durable R2 cleanup after Administrator removes a musician.
-- Never tie these rows to chat_members: they must survive deleting the actor.
-- Storage bytes stay accounted for until the corresponding R2 object is gone.
CREATE TABLE IF NOT EXISTS r2_member_delete_queue (
  object_key TEXT PRIMARY KEY NOT NULL,
  actor_id TEXT NOT NULL,
  multipart_upload_id TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0 CHECK (size_bytes>=0),
  queued_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_r2_member_delete_queue_actor
  ON r2_member_delete_queue(actor_id,queued_at);
