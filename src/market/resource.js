// Phase 19 — 资源模型
class Resource {
  constructor(data) {
    this.id = 'resource:' + Date.now();
    this.owner = data.owner;
    this.type = data.type;      // storage / relay / compute / agent
    this.capacity = data.capacity;
    this.price = data.price || 1;
    this.reputation = data.reputation || 500;
    this.historySuccess = data.historySuccess || 100;
    this.created = Date.now();
  }
}

module.exports = Resource;
