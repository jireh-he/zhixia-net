CREATE TABLE IF NOT EXISTS resource_quota (
  agent_id TEXT,
  resource_type TEXT,
  limit_value REAL,
  used_value REAL
);
