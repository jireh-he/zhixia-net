// Phase 17 — Governance Store
class GovernanceStore {
  constructor() { this.proposals = new Map(); }
  save(proposal) { this.proposals.set(proposal.id, proposal); return proposal; }
  get(id)         { return this.proposals.get(id); }
  list(status)    {
    const arr = [...this.proposals.values()];
    if (!status) return arr;
    return arr.filter(p => p.status === status);
  }
}

module.exports = new GovernanceStore();
