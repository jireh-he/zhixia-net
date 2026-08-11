// Storage: Messages — SQLite 消息存储（发送箱 + 收件箱）
const { initDatabase } = require('../engine/database');

class MessageStore {
  constructor() {
    this.db = initDatabase();
  }

  // 保存发送/接收的消息
  save(msg) {
    this.db.prepare(
      'INSERT OR REPLACE INTO messages (id, sender, receiver, type, payload, signature, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(msg.id, msg.from, msg.to, msg.type, JSON.stringify(msg.payload), msg.signature || null, msg.status || 'sent', msg.createdAt || Date.now());
  }

  // 获取某用户的历史消息（发送 + 接收）
  history(userId, limit = 50) {
    return this.db.prepare(
      'SELECT * FROM messages WHERE sender = ? OR receiver = ? ORDER BY created_at DESC LIMIT ?'
    ).all(userId, userId, limit);
  }

  // 发送箱
  outbox(userId, limit = 50) {
    return this.db.prepare(
      'SELECT * FROM messages WHERE sender = ? ORDER BY created_at DESC LIMIT ?'
    ).all(userId, limit);
  }

  // 收件箱
  inbox(userId, limit = 50) {
    return this.db.prepare(
      'SELECT * FROM messages WHERE receiver = ? ORDER BY created_at DESC LIMIT ?'
    ).all(userId, limit);
  }

  // 按对方用户查询
  withPeer(userId, peerId, limit = 50) {
    return this.db.prepare(
      'SELECT * FROM messages WHERE (sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?) ORDER BY created_at DESC LIMIT ?'
    ).all(userId, peerId, peerId, userId, limit);
  }

  // 待发送（pending 状态，用于离线重传）
  pending(userId) {
    return this.db.prepare(
      'SELECT * FROM messages WHERE sender = ? AND status = ? ORDER BY created_at ASC'
    ).all(userId, 'pending');
  }
}

module.exports = new MessageStore();