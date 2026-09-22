// Phase 17 — 规则管理
class RuleManager {
  constructor() {
    this.rules = {
      chunkSize: '1MB',
      replica: 3,
      maxMessageSize: 1048576,
      trustThreshold: 800,
      sybilThreshold: 100
    };
  }

  update(change) { Object.assign(this.rules, change); return this.rules; }
  get(key) { return this.rules[key]; }
  all() { return this.rules; }
}

module.exports = new RuleManager();
