CREATE TABLE IF NOT EXISTS agent_identity (
  id TEXT PRIMARY KEY,
  owner_id TEXT,
  name TEXT,
  trust_level INTEGER,
  created_at INTEGER
);
