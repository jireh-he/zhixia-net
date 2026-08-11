// Layer 2: SQLite Database
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DEFAULT_DB_PATH = path.join(process.env.HOME || process.env.USERPROFILE, '.zhixia', 'zhixia.db');

function getDbPath() {
  return process.env.ZHIXIA_DB_PATH || DEFAULT_DB_PATH;
}

function ensureDir(dbPath) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function initDatabase(dbPath = getDbPath()) {
  ensureDir(dbPath);
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // 声誉图（本地观察缓存）
  db.exec(`
    CREATE TABLE IF NOT EXISTS reputation (
      peer_pubkey TEXT NOT NULL, topic TEXT NOT NULL,
      technical_accuracy REAL DEFAULT 0.5, information_freshness REAL DEFAULT 0.5,
      collaboration REAL DEFAULT 0.5, civility REAL DEFAULT 0.5,
      last_interaction INTEGER, introduced_by TEXT,
      PRIMARY KEY (peer_pubkey, topic)
    );
    CREATE INDEX IF NOT EXISTS idx_reputation_topic ON reputation(topic);
  `);

  // 消息元数据日志
  db.exec(`
    CREATE TABLE IF NOT EXISTS message_log (
      msg_id TEXT PRIMARY KEY, peer_pubkey TEXT, topic TEXT,
      msg_type TEXT, size_bytes INTEGER, content_hash TEXT,
      received_at INTEGER, quality_score REAL, action_taken TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_msglog_topic ON message_log(topic);
  `);

  // 威胁日志
  db.exec(`
    CREATE TABLE IF NOT EXISTS threat_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, peer_pubkey TEXT,
      threat_type TEXT, details TEXT, detected_at INTEGER, action TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_threat_peer ON threat_log(peer_pubkey);
  `);

  // Agent 名片
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_cards (
      pubkey TEXT PRIMARY KEY, name TEXT, capabilities TEXT,
      mcp_endpoints TEXT, last_seen INTEGER, verified INTEGER DEFAULT 0
    );
  `);

  // 投票记录
  db.exec(`
    CREATE TABLE IF NOT EXISTS votes (
      vote_id TEXT PRIMARY KEY, topic TEXT, proposal_id TEXT,
      voter_pubkey TEXT, weight REAL, choice TEXT, cast_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_votes_proposal ON votes(proposal_id);
  `);

  // 审计日志
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp INTEGER,
      actor TEXT, command TEXT, params TEXT, result TEXT,
      peer_pubkey TEXT, details TEXT
    );
  `);

  // 声誉证明表
  db.exec(`
    CREATE TABLE IF NOT EXISTS attestations (
      attestation_id TEXT PRIMARY KEY,
      issuer_pubkey TEXT NOT NULL, target_pubkey TEXT NOT NULL, topic TEXT NOT NULL,
      technical_accuracy REAL, information_freshness REAL,
      collaboration REAL, civility REAL,
      issued_at INTEGER, expires_at INTEGER,
      signature TEXT NOT NULL, raw_json TEXT,
      received_at INTEGER DEFAULT (strftime('%s','now') * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_attest_target ON attestations(target_pubkey);
    CREATE INDEX IF NOT EXISTS idx_attest_issuer ON attestations(issuer_pubkey);
  `);

  // ====== 新增：传播奖励表 ======
  db.exec(`
    CREATE TABLE IF NOT EXISTS propagation_rewards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      origin_pubkey TEXT NOT NULL,
      origin_msg_id TEXT NOT NULL,
      topic TEXT NOT NULL,
      hop_count INTEGER,
      rewarded_at INTEGER,
      reward_type TEXT,
      beneficiary_pubkey TEXT,
      reward_amount REAL,
      UNIQUE(origin_pubkey, origin_msg_id, beneficiary_pubkey, reward_type)
    );
    CREATE INDEX IF NOT EXISTS idx_prop_origin ON propagation_rewards(origin_pubkey, origin_msg_id);
    CREATE INDEX IF NOT EXISTS idx_prop_beneficiary ON propagation_rewards(beneficiary_pubkey);
    CREATE INDEX IF NOT EXISTS idx_prop_topic ON propagation_rewards(topic);
  `);

  // 完整性校验表
  db.exec(`
    CREATE TABLE IF NOT EXISTS integrity_check (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      merkle_root TEXT, checked_at INTEGER, signature TEXT
    );
  `);

  return db;
}

module.exports = { initDatabase, getDbPath };
