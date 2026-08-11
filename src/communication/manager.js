// Communication: MessageManager — 创建/签名/保存/查询的完整流程
const msgObj = require('./message');
const msgCrypto = require('./crypto');
const msgStore = require('../storage/message-store');
const identityResolver = require('../identity/resolver');
const fs = require('fs/promises');
const path = require('path');

class MessageManager {
  async _loadSelf() {
    const users = await fs.readdir(path.join(process.env.HOME || process.env.USERPROFILE, '.zhixia/users'));
    if (!users.length) throw new Error('No identity, run user:create first');
    const idDir = path.join(process.env.HOME || process.env.USERPROFILE, '.zhixia/users', users[0]);
    const identity = JSON.parse(await fs.readFile(path.join(idDir, 'identity.json'), 'utf8'));
    const privateKey = await fs.readFile(path.join(idDir, 'private.key'), 'utf8');
    return { identity, privateKey };
  }

  async create({ to, text }) {
    const self = await this._loadSelf();
    const msg = msgObj.create({
      from: self.identity.id,
      to,
      type: 'text',
      payload: { text }
    });

    // 签名（签名时不含 status，status 是传输元数据）
    const sig = msgCrypto.sign(msg, self.privateKey);
    msg.signature = sig.toString('hex');
    msg.status = 'sent';

    // 保存
    msgStore.save(msg);

    return msg;
  }

  async verify(msg) {
    const resolved = await identityResolver.resolve(msg.from);
    if (!resolved) return false;
    // 签名时不包含 status（元数据），验证时同样排除
    const unSig = { ...msg, signature: undefined, status: undefined };
    return msgCrypto.verify(unSig, msg.signature, resolved.publicKey);
  }

  async saveReceived(msg) {
    const valid = await this.verify(msg);
    if (!valid) return { ok: false, err: 'signature verification failed' };
    msgStore.save({ ...msg, status: 'received' });
    return { ok: true };
  }

  history(userId, limit = 50) {
    return msgStore.history(userId || 'zid:unknown', limit);
  }

  inbox(userId, limit = 50) {
    return msgStore.inbox(userId || 'zid:unknown', limit);
  }

  outbox(userId, limit = 50) {
    return msgStore.outbox(userId || 'zid:unknown', limit);
  }

  withPeer(userId, peerId, limit = 50) {
    return msgStore.withPeer(userId || 'zid:unknown', peerId, limit);
  }

  pending(userId) {
    return msgStore.pending(userId || 'zid:unknown');
  }

  savePending(msg) {
    msgStore.save({ ...msg, status: 'pending' });
  }
}

module.exports = new MessageManager();