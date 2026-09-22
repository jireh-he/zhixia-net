// Phase 1 — Node Runtime
const config = require('./node-config');
const status = require('./node-status');

class NodeRuntime {
  constructor() { this.running = false; }

  async start(opts = {}) {
    const id = opts.id || 'zid:local';
    status.online(id);
    config.save({ id, port: opts.port || 4001, started: Date.now() });
    this.running = true;
    return status.get();
  }

  async stop() {
    this.running = false;
    return status.offline();
  }

  getStatus() { return status.get(); }
  getConfig() { return config.get(); }
}

module.exports = new NodeRuntime();
