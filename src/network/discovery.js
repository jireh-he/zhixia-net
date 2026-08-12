// v0.6.0 Node Discovery — bootstrap / LAN
class Discovery {
  constructor() { this.nodes = []; }
  add(node)     { if (!this.nodes.some(n => n.id === node.id)) this.nodes.push(node); }
  remove(id)    { this.nodes = this.nodes.filter(n => n.id !== id); }
  find()        { return this.nodes; }
  findById(id)  { return this.nodes.find(n => n.id === id); }
}

module.exports = new Discovery();
