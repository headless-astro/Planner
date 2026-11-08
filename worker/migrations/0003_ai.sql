-- Connecting an AI (F74): the app sends a week-by-week summary for the connector to read, and
-- the connector's sign-in asks for a short code the app shows. Both are kept per space.

-- One row per week (its Monday), plus a 'context' row with the food guidelines and when it was sent.
CREATE TABLE ai_weeks (
  space TEXT NOT NULL,
  week TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (space, week)
);

-- Sign-in codes: one use each, for 10 minutes. Only a hash of each code is kept.
CREATE TABLE ai_codes (
  code_hash TEXT PRIMARY KEY,
  space TEXT NOT NULL,
  expires INTEGER NOT NULL
);
