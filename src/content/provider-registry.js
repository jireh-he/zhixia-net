// v0.6.3 Provider Registry — 谁拥有哪个 CID
class ProviderRegistry {
  constructor() { this.index = new Map(); }
  provide(cid, node) {
    if (!this.index.has(cid)) this.index.set(cid, []);
    const arr = this.index.get(cid);
    if (!arr.some(n => n.id === node.id)) arr.push(node);
  }
  find(cid)  { return this.index.get(cid) || []; }
  remove(cid, node) {
    const arr = this.index.get(cid);
    if (!arr) return;
    this.index.set(cid, arr.filter(n => n.id !== node.id));
  }
  list() { return [...this.index.entries()]; }
}

module.exports = new ProviderRegistry();
