CREATE TABLE IF NOT EXISTS node_task (
  id TEXT PRIMARY KEY,
  node_id TEXT,
  task_name TEXT,
  status TEXT,
  result TEXT,
  scheduled_at INTEGER,
  completed_at INTEGER
);
