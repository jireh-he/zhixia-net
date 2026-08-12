// v0.6.0 DHT 基础接口
class DHT {
  constructor() { this.table = new Map(); }
  put(key, value) { this.table.set(key, value); }
  get(key)        { return this.table.get(key); }
  remove(key)     { return this.table.delete(key); }
  list()          { return [...this.table.entries()]; }
}

module.exports = new DHT();
