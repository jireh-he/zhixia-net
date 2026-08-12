// Phase 15 — 信任关系图
// 节点 = 用户，边 = 信任关系 { from, to, value }
class TrustGraph {
  constructor() { this.graph = new Map(); }

  addTrust(from, to, value) {
    if (!this.graph.has(from)) this.graph.set(from, []);
    this.graph.get(from).push({ target: to, value: value || 1, time: Date.now() });
  }

  addDistrust(from, to, value) {
    this.addTrust(from, to, -(value || 1));
  }

  getTrust(id)    { return this.graph.get(id) || []; }

  getIncoming(id) {
    const out = [];
    for (const [from, edges] of this.graph) {
      for (const e of edges) if (e.target === id) out.push({ from, value: e.value, time: e.time });
    }
    return out;
  }

  // 计算某节点信任分（收到的正信任 - 负信任）
  trustScore(id) {
    const list = this.getIncoming(id);
    return list.reduce((s, e) => s + e.value, 0);
  }

  // 二阶传播信任：A→B→C，C 获得 A 的衰减信任
  propagatedTrust(target, depth = 2, decay = 0.5) {
    let total = 0;
    const visited = new Set();
    const queue = this.getIncoming(target).map(e => ({ from: e.from, weight: e.value, d: 0 }));
    while (queue.length > 0) {
      const { from, weight, d } = queue.shift();
      if (visited.has(from) || d >= depth) continue;
      visited.add(from);
      total += weight * Math.pow(decay, d);
      for (const e of this.getIncoming(from)) {
        queue.push({ from: e.from, weight: e.value, d: d + 1 });
      }
    }
    return total;
  }

  list() { return [...this.graph.entries()]; }
}

module.exports = new TrustGraph();
