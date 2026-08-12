CREATE TABLE IF NOT EXISTS market_resource (
  id TEXT PRIMARY KEY,
  owner TEXT,
  type TEXT,
  capacity REAL,
  price REAL,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS market_order (
  id TEXT PRIMARY KEY,
  requester TEXT,
  type TEXT,
  amount REAL,
  status TEXT,
  provider TEXT,
  created_at INTEGER
);
