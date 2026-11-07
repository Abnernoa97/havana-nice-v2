-- HAVANA NICE 2: allowlisted musician names, independent of official HAVANA NICE.
-- Login is only the approved name (case-insensitive); a random per-installation
-- bearer token is remembered locally and revoked centrally by changing active=0.
CREATE TABLE IF NOT EXISTS chat_members (
 username TEXT PRIMARY KEY NOT NULL COLLATE NOCASE,
 actor_id TEXT NOT NULL UNIQUE,
 display_name TEXT NOT NULL,
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 created_at TEXT NOT NULL DEFAULT (datetime('now')),
 updated_at TEXT NOT NULL DEFAULT (datetime('now')),
 CHECK(length(username) BETWEEN 1 AND 28)
);
CREATE INDEX IF NOT EXISTS idx_chat_members_active ON chat_members(active);

-- No default musicians are created here. Only the authenticated Administrator
-- may add names through the current V2 access management API.
