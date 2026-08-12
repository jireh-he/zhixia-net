// v0.6.2 DHT Router
const table = require('./routing-table');
const crypto = require('crypto');

class DHTRouter {
  constructor() { this.selfId = null; }
  setSelf(id) { this.selfId = id; }

  distance(targetId) {
    if (!this.selfId || !targetId) return 0;
    const a = crypto.createHash('sha256').update(this.selfId).digest();
    const b = crypto.createHash('sha256').update(targetId).digest();
    return crypto.createHash('sha256').update(Buffer.concat([a, b])).digest('hex').slice(0, 4);
  }

  register(node) { table.add(node, this.distance(node.id)); }
  find(target)    { return table.find(this.distance(target)); }
  list()          { return table.list(); }
}

module.exports = new DHTRouter();
