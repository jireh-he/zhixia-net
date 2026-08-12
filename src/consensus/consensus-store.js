// Phase 16 — Consensus Store
class ConsensusStore {
  constructor() { this.data = new Map(); }
  save(id, data) { this.data.set(id, data); }
  get(id)        { return this.data.get(id); }
  has(id)        { return this.data.has(id); }
  list()         { const out = []; for (const [k, v] of this.data) out.push({ id: k, data: v }); return out; }
}

module.exports = new ConsensusStore();
