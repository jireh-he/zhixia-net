CREATE TABLE IF NOT EXISTS node_status (
  node_id TEXT PRIMARY KEY,
  status TEXT,
  version TEXT,
  last_seen INTEGER
);
