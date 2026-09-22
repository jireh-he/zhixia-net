CREATE TABLE IF NOT EXISTS resource_usage (
  id TEXT PRIMARY KEY,
  provider TEXT,
  consumer TEXT,
  resource_type TEXT,
  amount REAL,
  created_at INTEGER
);
