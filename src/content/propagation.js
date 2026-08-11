// Content: Propagation — 传播链记录
// 内容从 A 发布 → B 分享 → C 转发，形成 Content Graph

const crypto = require('crypto');
const { initDatabase } = require('../engine/database');

class Propagation {
  constructor() {
    this.db = initDatabase();
  }

  record({ contentId, from, to, action }) {
    const id = 'prop:' + crypto.randomBytes(4).toString('hex');
    this.db.prepare(
      'INSERT OR REPLACE INTO content_propagation (id, content_id, from_user, to_user, action, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, contentId, from, to || null, action, Date.now());
    return id;
  }

  chain(contentId) {
    return this.db.prepare(
      'SELECT * FROM content_propagation WHERE content_id = ? ORDER BY created_at ASC'
    ).all(contentId);
  }

  list(limit = 50) {
    return this.db.prepare(
      'SELECT * FROM content_propagation ORDER BY created_at DESC LIMIT ?'
    ).all(limit);
  }
}

module.exports = new Propagation();