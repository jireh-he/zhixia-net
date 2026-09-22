// v0.6.1 SecureSession — 加密 + 防重放
const cipher = require('./cipher');
const replay = require('./replay');
const crypto = require('crypto');

class SecureSession {
  constructor(peer, key) {
    this.peer = peer;
    this.key = key;
    this.status = 'established';
    this.created = Date.now();
  }
  send(message) {
    const id = crypto.randomBytes(4).toString('hex') + ':' + Date.now();
    if (!replay.check(id)) throw new Error('Replay detected');
    return cipher.encrypt({ id, message }, this.key);
  }
  receive(packet) {
    if (!replay.check(packet.id)) throw new Error('Replay detected');
    return cipher.decrypt(packet, this.key);
  }
  info() {
    return { peer: this.peer, status: this.status, encryption: 'AES-256-GCM', created: this.created };
  }
}

module.exports = SecureSession;
