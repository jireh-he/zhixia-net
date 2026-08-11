// Storage: Peer Store — 在线用户缓存
// 由 daemon 在 identity.hello 接收时更新，CLI 通过 peers 表查询

const { initDatabase } = require('../engine/database');

class PeerStore {
  constructor() {
    this.db = initDatabase();
  }

  update({ userId, publicKey, capabilities }) {
    this.db.prepare(
      'INSERT OR REPLACE INTO peers (user_id, public_key, capabilities, last_seen) VALUES (?, ?, ?, ?)'
    ).run(userId, publicKey, JSON.stringify(capabilities), Date.now());
  }

  remove(userId) {
    this.db.prepare('DELETE FROM peers WHERE user_id = ?').run(userId);
  }

  list() {
    return this.db.prepare('SELECT * FROM peers ORDER BY last_seen DESC').all();
  }

  get(userId) {
    return this.db.prepare('SELECT * FROM peers WHERE user_id = ?').get(userId);
  }
}

module.exports = new PeerStore();