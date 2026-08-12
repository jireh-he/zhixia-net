CREATE TABLE IF NOT EXISTS trust_graph (
  from_id TEXT,
  to_id TEXT,
  value REAL,
  time INTEGER
);

CREATE TABLE IF NOT EXISTS abuse_event (
  id TEXT PRIMARY KEY,
  source TEXT,
  type TEXT,
  detail TEXT,
  time INTEGER
);

CREATE TABLE IF NOT EXISTS abuse_blacklist (
  id TEXT PRIMARY KEY,
  reason TEXT,
  time INTEGER
);
