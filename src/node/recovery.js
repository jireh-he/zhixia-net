// node/recovery.js — 故障恢复
const node = require('./node');

class Recovery {
  constructor() { this.watchers = []; }

  addWatcher(handler) { this.watchers.push(handler); }

  attempt() {
    const info = node.statusInfo();
    for (const w of this.watchers) {
      try { w(info); } catch (e) { /* log */ }
    }
    if (info.status !== 'RUNNING' && info.status !== 'ONLINE') {
      node.start();
    }
  }
}

module.exports = new Recovery();
