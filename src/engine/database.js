// Layer 2: SQLite Database
// 使用 better-sqlite3 + WAL 模式，支持加密（sqlcipher 扩展）

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DEFAULT_DB_PATH = path.join(process.env.HOME || process.env.USERPROFILE, '.zhixia', 'zhixia.db');

function getDbPath() {
  const customPath = process.env.ZHIXIA_DB_PATH;
  return customPath || DEFAULT_DB_PATH;
}

function ensureDir(dbPath) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function initDatabase(dbPath = getDbPath()) {
  ensureDir(dbPath);
  const db = new Database(dbPath);

  // WAL 模式提升并发性能
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // 声誉图（按 Topic 隔离）
  db.exec(`
    CREATE TABLE IF NOT EXISTS reputation (
      peer_pubkey TEXT NOT NULL,
      topic TEXT NOT NULL,
      technical_accuracy REAL DEFAULT 0.5,
      information_freshness REAL DEFAULT 0.5,
      collaboration REAL DEFAULT 0.5,
      civility REAL DEFAULT 0.5,
      last_interaction INTEGER,
      introduced_by TEXT,
      PRIMARY KEY (peer_pubkey, topic)
    );
    CREATE INDEX IF NOT EXISTS idx_reputation_topic ON reputation(topic);
    CREATE INDEX IF NOT EXISTS idx_reputation_last ON reputation(last_interaction);
  `);

  // 消息元数据日志
  db.exec(`
    CREATE TABLE IF NOT EXISTS message_log (
      msg_id TEXT PRIMARY KEY,
      peer_pubkey TEXT,
      topic TEXT,
      msg_type TEXT,
      size_bytes INTEGER,
      content_hash TEXT,
      received_at INTEGER,
      quality_score REAL,
      action_taken TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_msglog_topic ON message_log(topic);
    CREATE INDEX IF NOT EXISTS idx_msglog_peer ON message_log(peer_pubkey);
  `);

  // 威胁日志
  db.exec(`
    CREATE TABLE IF NOT EXISTS threat_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      peer_pubkey TEXT,
      threat_type TEXT,
      details TEXT,
      detected_at INTEGER,
      action TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_threat_peer ON threat_log(peer_pubkey);
    CREATE INDEX IF NOT EXISTS idx_threat_time ON threat_log(detected_at);
  `);

  // 已知 Agent 名片
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_cards (
      pubkey TEXT PRIMARY KEY,
      name TEXT,
      capabilities TEXT,
      mcp_endpoints TEXT,
      last_seen INTEGER,
      verified INTEGER DEFAULT 0
    );
  `);

  // 投票记录
  db.exec(`
    CREATE TABLE IF NOT EXISTS votes (
      vote_id TEXT PRIMARY KEY,
      topic TEXT,
      proposal_id TEXT,
      voter_pubkey TEXT,
      weight REAL,
      choice TEXT,
      cast_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_votes_proposal ON votes(proposal_id);
  `);

  // 审计日志
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER,
      actor TEXT,
      command TEXT,
      params TEXT,
      result TEXT,
      peer_pubkey TEXT,
      details TEXT
    );
  `);

  return db;
}

module.exports = { initDatabase, getDbPath };
