CREATE TABLE IF NOT EXISTS content_trust (
  cid TEXT PRIMARY KEY,
  author_score REAL,
  propagation_score REAL,
  verification_score REAL,
  user_score REAL,
  total_score REAL,
  updated_at INTEGER
);
