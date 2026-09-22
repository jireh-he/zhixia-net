// Phase 19 — 资源匹配（信誉 + 贡献 + 历史成功率 + 价格综合评分）
class Matcher {
  constructor() { this.index = new Map(); }

  register(resource) {
    if (!this.index.has(resource.type)) this.index.set(resource.type, []);
    this.index.get(resource.type).push(resource);
  }

  match(order, resources) {
    const pool = resources || this.index.get(order.type) || [];
    const candidates = pool.filter(r => r.type === order.type && r.capacity >= order.amount);
    return candidates.sort((a, b) => this.score(b) - this.score(a));
  }

  score(r) {
    // 综合评分：信誉 40% + 历史成功率 30% + 1/价格 20% + 容量 10%
    return (
      (r.reputation || 500) * 0.4 +
      (r.historySuccess || 100) * 0.3 +
      (r.price > 0 ? 1000 / r.price : 0) * 0.2 +
      r.capacity * 0.1
    );
  }

  list(type) {
    return this.index.get(type) || [];
  }
}

module.exports = new Matcher();
