// v0.6.2 KBucket — Kademlia 风格桶
class KBucket {
  constructor(size = 20) { this.size = size; this.nodes = []; }
  add(node) {
    if (this.nodes.length >= this.size) return false;
    this.nodes.push(node);
    return true;
  }
  remove(id) { this.nodes = this.nodes.filter(n => n.id !== id); }
  list()    { return this.nodes; }
}

module.exports = KBucket;
