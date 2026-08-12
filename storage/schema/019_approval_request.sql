CREATE TABLE IF NOT EXISTS approval_request (
  id TEXT PRIMARY KEY,
  agent_id TEXT,
  action TEXT,
  status TEXT,
  created_at INTEGER
);
