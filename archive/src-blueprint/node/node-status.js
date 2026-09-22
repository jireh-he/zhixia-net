// Phase 1 — Node Status
class NodeStatus {
  constructor() {
    this.status = { online: false, started: null, peers: 0, uptime: 0 };
  }

  online(id) {
    this.status.online = true;
    this.status.started = Date.now();
    this.status.id = id;
    return this.status;
  }

  offline() {
    const up = this.status.started ? Date.now() - this.status.started : 0;
    this.status.online = false;
    this.status.uptime = up;
    return this.status;
  }

  get() { return this.status; }
}

module.exports = new NodeStatus();
