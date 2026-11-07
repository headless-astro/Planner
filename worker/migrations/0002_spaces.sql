-- More than one person on one server (F66, D72): each key gets its own space. The key that
-- claimed the server keeps everything already here, and is the owner who can invite others.

CREATE TABLE spaces (
  key_hash TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);
INSERT INTO spaces (key_hash, created_at) SELECT value, 0 FROM meta WHERE key = 'key_hash';

-- Records move into the owner's space. SQLite can't change a primary key, so the table is rebuilt.
CREATE TABLE records_spaced (
  space TEXT NOT NULL,
  tbl TEXT NOT NULL,
  id TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (space, tbl, id)
);
INSERT INTO records_spaced (space, tbl, id, updated_at, seq, data)
  SELECT COALESCE((SELECT value FROM meta WHERE key = 'key_hash'), ''), tbl, id, updated_at, seq, data FROM records;
DROP TABLE records;
ALTER TABLE records_spaced RENAME TO records;
CREATE INDEX records_by_space_seq ON records (space, seq);
CREATE INDEX records_by_seq ON records (seq);

-- Each device's reminders follow the times set in its own space.
ALTER TABLE subscriptions ADD COLUMN space TEXT NOT NULL DEFAULT '';
UPDATE subscriptions SET space = COALESCE((SELECT value FROM meta WHERE key = 'key_hash'), '');

-- One-time codes the owner makes to let someone in. Only a hash of each code is kept.
CREATE TABLE invites (
  code_hash TEXT PRIMARY KEY,
  expires INTEGER NOT NULL
);
