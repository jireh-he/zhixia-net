CREATE TABLE IF NOT EXISTS resource_contribution (
  id TEXT PRIMARY KEY,
  agent_id TEXT,
  resource_type TEXT,
  amount REAL,
  score REAL,
  created_at INTEGER
);
