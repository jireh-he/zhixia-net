// Communication: Relay Queue — 离线消息加密队列
// 用户 B 不在线时，加密消息存入 queue，B 上线后 sync 拉取
// 全程加密：Relay 永远只保存密文

const { initDatabase } = require('../../engine/database');

class RelayQueue {
  constructor() {
    this.db = initDatabase();
  }

  push(secureMsg, expireMinutes = 60) {
    const now = Date.now();
    this.db.prepare(
      'INSERT OR REPLACE INTO message_queue (id, receiver, payload, created_at, expire_at) VALUES (?, ?, ?, ?, ?)'
    ).run(
      secureMsg.id || secureMsg.from + ':' + secureMsg.createdAt,
      secureMsg.to,
      JSON.stringify(secureMsg),
      now,
      now + expireMinutes * 60 * 1000
    );
  }

  pull(receiverId) {
    return this.db.prepare(
      'SELECT * FROM message_queue WHERE receiver = ? AND expire_at > ? ORDER BY created_at ASC'
    ).all(receiverId, Date.now());
  }

  remove(id) {
    this.db.prepare('DELETE FROM message_queue WHERE id = ?').run(id);
  }

  removeByReceiver(receiverId) {
    this.db.prepare('DELETE FROM message_queue WHERE receiver = ?').run(receiverId);
  }

  cleanup() {
    this.db.prepare('DELETE FROM message_queue WHERE expire_at < ?').run(Date.now());
  }
}

module.exports = new RelayQueue();