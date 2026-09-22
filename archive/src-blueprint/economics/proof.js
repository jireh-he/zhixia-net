// Phase 18 — 贡献证明（多节点抽查）
class Proof {
  constructor() { this.records = []; }

  verify(contribution) {
    const valid = contribution.type && contribution.value > 0;
    this.records.push({ contribution: contribution.id, valid, verifier: 'self', time: Date.now() });
    return { valid, source: contribution.node, time: Date.now() };
  }

  history(nodeId) { return this.records.filter(r => r.contribution === nodeId); }
}

module.exports = new Proof();
