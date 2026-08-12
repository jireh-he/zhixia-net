CREATE TABLE IF NOT EXISTS verification_event (
  id TEXT PRIMARY KEY,
  cid TEXT,
  validator TEXT,
  result TEXT,
  proof TEXT,
  timestamp INTEGER
);
