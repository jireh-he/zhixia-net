// Content: Provider — 内容提供者发现
// 网络只广播"谁拥有这个 CID"，不传输文件本身
const { initDatabase } = require('../engine/database');

class ProviderManager {
  constructor() {
    this.db = initDatabase();
  }

  // 注册 provider: 声明"我拥有这个 CID"
  announce(contentId, userId) {
    this.db.prepare(
      'INSERT OR IGNORE INTO content_providers (content_id, provider_id, announced_at) VALUES (?, ?, ?)'
    ).run(contentId, userId, Date.now());
  }

  // 查询某 CID 的所有 provider
  list(contentId) {
    return this.db.prepare(
      'SELECT * FROM content_providers WHERE content_id = ? ORDER BY announced_at DESC'
    ).all(contentId);
  }

  // 查找某用户拥有的所有内容
  byUser(userId) {
    return this.db.prepare(
      'SELECT * FROM content_providers WHERE provider_id = ? ORDER BY announced_at DESC'
    ).all(userId);
  }

  // 移除过期/失效 provider
  remove(contentId, userId) {
    this.db.prepare(
      'DELETE FROM content_providers WHERE content_id = ? AND provider_id = ?'
    ).run(contentId, userId);
  }
}

module.exports = new ProviderManager();
