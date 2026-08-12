CREATE TABLE IF NOT EXISTS contribution_record (
  id TEXT PRIMARY KEY,
  node TEXT,
  type TEXT,
  value REAL,
  time INTEGER
);

CREATE TABLE IF NOT EXISTS balance_account (
  id TEXT PRIMARY KEY,
  balance REAL
);
