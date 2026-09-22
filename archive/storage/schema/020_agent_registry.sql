CREATE TABLE IF NOT EXISTS agent_registry (
  id TEXT PRIMARY KEY,
  owner_id TEXT,
  name TEXT,
  capabilities TEXT,
  public_key TEXT,
  status TEXT,
  created_at INTEGER
);
