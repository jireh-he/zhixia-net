// Layer 2: SQLite Database
// 使用 Node 22+ 内置 node:sqlite（零外部 native 依赖）
const { DatabaseSync } = require('node:sqlite');
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
  const db = new DatabaseSync(dbPath);
  try { db.exec('PRAGMA journal_mode = WAL'); } catch (e) { /* WAL 可能不支持 */ }
  try { db.exec('PRAGMA foreign_keys = ON'); } catch (e) { }

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

  db.exec(`
    CREATE TABLE IF NOT EXISTS message_log (
      msg_id TEXT PRIMARY KEY, peer_pubkey TEXT, topic TEXT,
      msg_type TEXT, size_bytes INTEGER, content_hash TEXT,
      received_at INTEGER, quality_score REAL, action_taken TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_msglog_topic ON message_log(topic);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS threat_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, peer_pubkey TEXT,
      threat_type TEXT, details TEXT, detected_at INTEGER, action TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_threat_peer ON threat_log(peer_pubkey);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_cards (
      pubkey TEXT PRIMARY KEY, name TEXT, capabilities TEXT,
      mcp_endpoints TEXT, last_seen INTEGER, verified INTEGER DEFAULT 0
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS peers (
      user_id TEXT PRIMARY KEY, public_key TEXT,
      capabilities TEXT, last_seen INTEGER
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, sender TEXT NOT NULL,
      receiver TEXT NOT NULL, type TEXT NOT NULL,
      payload TEXT NOT NULL, signature TEXT,
      status TEXT DEFAULT 'pending', created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_msg_receiver ON messages(receiver);
    CREATE INDEX IF NOT EXISTS idx_msg_sender ON messages(sender);
  `);

  // 离线消息队列（v0.3.2.2 端到端加密 + Relay）
  db.exec(`
    CREATE TABLE IF NOT EXISTS message_queue (
      id TEXT PRIMARY KEY, receiver TEXT,
      payload TEXT, created_at INTEGER, expire_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_queue_receiver ON message_queue(receiver);
    CREATE INDEX IF NOT EXISTS idx_queue_expire ON message_queue(expire_at);
  `);

  // 加密密钥交换缓存（v0.3.2.2）
  db.exec(`
    CREATE TABLE IF NOT EXISTS key_exchange_cache (
      peer_id TEXT PRIMARY KEY, shared_secret TEXT,
      peer_x25519_pub TEXT, derived_at INTEGER
    );
  `);

  // 内容对象注册表（v0.3.3 Content Layer）
  db.exec(`
    CREATE TABLE IF NOT EXISTS contents (
      id TEXT PRIMARY KEY, owner TEXT,
      hash TEXT, type TEXT, metadata TEXT,
      created_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_contents_owner ON contents(owner);
  `);

  // 内容传播链（v0.3.3 Content Graph → Trust System 基础）
  db.exec(`
    CREATE TABLE IF NOT EXISTS content_propagation (
      id TEXT PRIMARY KEY, content_id TEXT,
      from_user TEXT, to_user TEXT,
      action TEXT, created_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_content_prop_content ON content_propagation(content_id);
    CREATE INDEX IF NOT EXISTS idx_content_prop_user ON content_propagation(from_user);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS content_chunks (
      content_id TEXT NOT NULL, chunk_index INTEGER NOT NULL,
      hash TEXT NOT NULL, size INTEGER,
      PRIMARY KEY (content_id, chunk_index)
    );
    CREATE INDEX IF NOT EXISTS idx_content_chunks_hash ON content_chunks(hash);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS content_providers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_id TEXT NOT NULL, provider_id TEXT NOT NULL,
      announced_at INTEGER,
      UNIQUE(content_id, provider_id)
    );
    CREATE INDEX IF NOT EXISTS idx_content_providers_cid ON content_providers(content_id);
    CREATE INDEX IF NOT EXISTS idx_content_providers_uid ON content_providers(provider_id);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS votes (
      vote_id TEXT PRIMARY KEY, topic TEXT, proposal_id TEXT,
      voter_pubkey TEXT, weight REAL, choice TEXT, cast_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_votes_proposal ON votes(proposal_id);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS trust_attestations (
      id TEXT PRIMARY KEY, from_user TEXT NOT NULL, target_user TEXT NOT NULL,
      subject TEXT, type TEXT, value REAL,
      evidence TEXT, signature TEXT, created_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_trust_attest_target ON trust_attestations(target_user);
    CREATE INDEX IF NOT EXISTS idx_trust_attest_from ON trust_attestations(from_user);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS trust_scores (
      user_id TEXT PRIMARY KEY,
      content_score REAL DEFAULT 0, network_score REAL DEFAULT 0, activity_score REAL DEFAULT 0,
      total_score REAL DEFAULT 0, calculated_at INTEGER
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp INTEGER,
      actor TEXT, command TEXT, params TEXT, result TEXT,
      peer_pubkey TEXT, details TEXT
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS attestations (
      attestation_id TEXT PRIMARY KEY,
      issuer_pubkey TEXT NOT NULL, target_pubkey TEXT NOT NULL, topic TEXT NOT NULL,
      technical_accuracy REAL, information_freshness REAL,
      collaboration REAL, civility REAL,
      issued_at INTEGER, expires_at INTEGER,
      signature TEXT NOT NULL, raw_json TEXT,
      received_at INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_attest_target ON attestations(target_pubkey);
    CREATE INDEX IF NOT EXISTS idx_attest_issuer ON attestations(issuer_pubkey);
  `);

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

  db.exec(`
    CREATE TABLE IF NOT EXISTS integrity_check (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      merkle_root TEXT, checked_at INTEGER, signature TEXT
    );
  `);

  return db;
}

module.exports = { initDatabase, getDbPath };