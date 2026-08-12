CREATE TABLE IF NOT EXISTS agent_tasks (
  id TEXT PRIMARY KEY,
  creator TEXT,
  executor TEXT,
  task_type TEXT,
  status TEXT,
  result TEXT,
  created_at INTEGER
);
