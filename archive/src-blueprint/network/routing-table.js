// v0.6.2 Routing Table
const KBucket = require('./kbucket');

class RoutingTable {
  constructor() { this.buckets = new Map(); }
  bucket(distance) {
    if (!this.buckets.has(distance)) this.buckets.set(distance, new KBucket());
    return this.buckets.get(distance);
  }
  add(node, distance) { this.bucket(distance).add(node); }
  remove(id) {
    for (const b of this.buckets.values()) b.remove(id);
  }
  find(distance) { return this.bucket(distance).list(); }
  list() {
    const out = [];
    for (const b of this.buckets.values()) out.push(...b.list());
    return out;
  }
}

module.exports = new RoutingTable();
