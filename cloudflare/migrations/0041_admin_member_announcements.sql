-- Administrator-authored announcements; additive, no changes to musician messages.
CREATE TABLE IF NOT EXISTS admin_member_announcements (
 id TEXT PRIMARY KEY NOT NULL,
 broadcast_id TEXT NOT NULL,
 recipient_id TEXT NOT NULL REFERENCES chat_members(actor_id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind='admin.announcement'),
 target_id TEXT NOT NULL DEFAULT '',
 preview TEXT NOT NULL DEFAULT '',
 created_at INTEGER NOT NULL,
 read_at INTEGER,
 UNIQUE(broadcast_id,recipient_id)
);
CREATE INDEX IF NOT EXISTS idx_admin_announcements_inbox ON admin_member_announcements(recipient_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_admin_announcements_unread ON admin_member_announcements(recipient_id,read_at);
