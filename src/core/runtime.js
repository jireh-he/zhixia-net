// Phase 21 — Core Runtime：统一模块生命周期
const path = require('path');

class Runtime {
  constructor() {
    this.modules = [];
    this.config = {};
    this.started = false;
  }

  loadConfig() {
    const p = path.join(__dirname, '../config/default.json');
    if (require('fs').existsSync(p)) {
      this.config = require('../../config/default.json');
    }
    return this.config;
  }

  register(name, module) {
    this.modules.push({ name, ...module });
    return this;
  }

  async start(opts = {}) {
    this.loadConfig();
    this.started = true;
    console.log('zhixia network online');
    for (const m of this.modules) {
      if (typeof m.start === 'function') {
        await m.start(opts);
      }
    }
    return { status: 'online', modules: this.modules.map(m => m.name), config: this.config };
  }

  async stop() {
    this.started = false;
    for (const m of this.modules.slice().reverse()) {
      if (typeof m.stop === 'function') await m.stop();
    }
    return { status: 'offline' };
  }

  isOnline() { return this.started; }
  list() { return this.modules.map(m => ({ name: m.name, active: this.started })); }
}

module.exports = new Runtime();
