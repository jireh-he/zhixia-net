// Phase 19 — Market Store
class MarketStore {
  constructor() {
    this.resources = new Map();
    this.orders = new Map();
  }
  saveResource(r)   { this.resources.set(r.id, r); return r; }
  getResource(id)    { return this.resources.get(id); }
  listResources(type){ const arr = [...this.resources.values()]; return type ? arr.filter(x => x.type === type) : arr; }
  saveOrder(o)       { this.orders.set(o.id, o); return o; }
  getOrder(id)       { return this.orders.get(id); }
  listOrders(status) { const arr = [...this.orders.values()]; return status ? arr.filter(x => x.status === status) : arr; }
}

module.exports = new MarketStore();
