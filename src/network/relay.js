// Phase 12 — Relay 中继客户端
const relayServer = require('./relay-server');

class Relay {
  constructor() { this.active = new Map(); }

  connect(peer) {
    const sessionId = 'relay:' + Date.now();
    this.active.set(sessionId, { target: peer.id, createdAt: Date.now() });
    return {
      mode: 'relay',
      sessionId,
      target: peer.id,
      server: relayServer.getEndpoint()
    };
  }

  send(sessionId, data) {
    if (!this.active.has(sessionId)) return { ok: false, reason: 'session not found' };
    const sess = this.active.get(sessionId);
    return { ok: true, sessionId, target: sess.target, bytes: data.length };
  }

  disconnect(sessionId) {
    return this.active.delete(sessionId);
  }
}

module.exports = new Relay();
