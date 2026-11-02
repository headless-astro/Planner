-- Every synced record from the app, as JSON. The newer updatedAt wins (PLAN.md 11.4).
CREATE TABLE records (
  tbl TEXT NOT NULL,
  id TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  -- Goes up with every accepted change, so a device can ask for everything after its cursor.
  seq INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (tbl, id)
);
CREATE INDEX records_by_seq ON records (seq);

-- The key's hash, the push keys and the app's address.
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- The devices that turned reminders on.
CREATE TABLE subscriptions (
  endpoint TEXT PRIMARY KEY,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  timezone TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Reminders already sent, so none goes out twice.
CREATE TABLE sent (
  endpoint TEXT NOT NULL,
  kind TEXT NOT NULL,
  day TEXT NOT NULL,
  PRIMARY KEY (endpoint, kind, day)
);
