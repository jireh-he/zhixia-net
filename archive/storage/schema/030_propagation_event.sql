CREATE TABLE IF NOT EXISTS propagation_event (
  id TEXT PRIMARY KEY,
  cid TEXT,
  from_node TEXT,
  to_node TEXT,
  action TEXT,
  timestamp INTEGER
);
