// Daemon: Identity Session
// 连接建立后发送/接收 identity.hello，让 P2P 节点认识"用户"而非仅"密钥"

const hello = require('../protocol/identity-hello');
const fs = require('fs/promises');
const path = require('path');

class IdentitySession {
  constructor() {
    this.home = path.join(process.env.HOME || process.env.USERPROFILE, '.zhixia/users');
    this._identity = null;
  }

  async load() {
    if (this._identity) return this._identity;
    let users;
    try { users = await fs.readdir(this.home); }
    catch { return null; }
    if (!users.length) return null;

    const idDir = path.join(this.home, users[0]);
    const identity = JSON.parse(await fs.readFile(path.join(idDir, 'identity.json'), 'utf8'));
    const privateKey = await fs.readFile(path.join(idDir, 'private.key'), 'utf8');
    this._identity = { identity, privateKey };
    return this._identity;
  }

  async introduce() {
    const self = await this.load();
    if (!self) return null;
    const payload = hello.create(self.identity, self.identity.profileHash || null, ['message', 'content', 'trust']);
    const sigBuf = hello.sign(payload, self.privateKey);
    const signature = sigBuf.toString ? sigBuf.toString('hex') : sigBuf;
    return { ...payload, signature };
  }

  async accept(message) {
    if (message.type !== 'identity.hello') {
      throw new Error('Invalid hello type');
    }
    if (message.signature) {
      const sigBuf = Buffer.isBuffer(message.signature) ? message.signature : Buffer.from(message.signature, 'hex');
      const ok = hello.verify({ ...message, signature: undefined }, sigBuf, message.user.publicKey);
      if (!ok) {
        throw new Error('Hello signature verification failed');
      }
    }
    return {
      userId: message.user.id,
      publicKey: message.user.publicKey,
      profileHash: message.user.profileHash,
      capabilities: message.node.capabilities
    };
  }
}

module.exports = new IdentitySession();