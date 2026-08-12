// Phase 1 — Node Config
const store = require('../storage/local-store');

class NodeConfig {
  save(config) { store.save('node-config', config); return config; }
  get() { return store.load('node-config') || {}; }
}

module.exports = new NodeConfig();
