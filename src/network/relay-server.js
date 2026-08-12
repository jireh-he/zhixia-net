// Phase 12 — Relay Server：中转服务器
class RelayServer {
  constructor() {
    this.clients = new Map();
    this.endpoint = null;
    this.sessions = new Map();
  }

  setEndpoint(url) { this.endpoint = url; }
  getEndpoint() { return this.endpoint || 'relay.zhixia.local:4000'; }

  register(id, socket) {
    this.clients.set(id, { socket, connected: Date.now() });
    return true;
  }

  unregister(id) { return this.clients.delete(id); }
  onlineCount() { return this.clients.size; }

  forward(from, to, data) {
    const target = this.clients.get(to);
    if (!target) return { ok: false, reason: 'target offline' };
    const sessionId = 'relay-srv:' + from + ':' + to;
    this.sessions.set(sessionId, { from, to, count: (this.sessions.get(sessionId) || {}).count + 1 });
    return { ok: true, sessionId, bytes: data.length, to };
  }

  list() {
    const out = [];
    for (const [id] of this.clients) out.push({ id, connected: Date.now() - this.clients.get(id).connected });
    return out;
  }
}

module.exports = new RelayServer();
