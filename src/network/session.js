// v0.6.0 Session 连接管理
class Session {
  constructor(peer, socket) {
    this.peer = peer;
    this.socket = socket;
    this.status = 'connected';
    this.created = Date.now();
    this.lastActivity = Date.now();
  }
  touch() { this.lastActivity = Date.now(); }
  close() {
    this.status = 'closed';
    if (this.socket) { try { this.socket.end(); } catch (_) {} }
  }
  info() {
    return { peer: this.peer, status: this.status, uptime: Date.now() - this.created };
  }
}

module.exports = Session;
