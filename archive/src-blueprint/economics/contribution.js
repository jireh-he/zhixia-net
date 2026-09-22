// Phase 18 — 贡献记录
class Contribution {
  constructor(data) {
    this.id = 'contrib:' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    this.node = data.node;
    this.type = data.type;     // storage / relay / message / compute
    this.value = data.value;
    this.time = data.time || Date.now();
  }
}

module.exports = Contribution;
