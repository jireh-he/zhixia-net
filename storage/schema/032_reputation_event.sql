CREATE TABLE IF NOT EXISTS reputation_event (
  id TEXT PRIMARY KEY,
  type TEXT,
  source TEXT,
  target TEXT,
  observer TEXT,
  detail TEXT,
  time INTEGER
);
