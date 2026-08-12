CREATE TABLE IF NOT EXISTS chunk_store (
  id TEXT PRIMARY KEY,
  cid TEXT,
  data BLOB,
  size INTEGER,
  saved_at INTEGER
);

CREATE TABLE IF NOT EXISTS content_manifest (
  cid TEXT PRIMARY KEY,
  chunks TEXT,
  size INTEGER,
  owner TEXT,
  created_at INTEGER
);
