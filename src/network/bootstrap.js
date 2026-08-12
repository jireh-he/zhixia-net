// v0.6.2 Bootstrap — 网络入口节点
class Bootstrap {
  constructor() { this.nodes = []; }
  add(node)   { if (!this.nodes.some(n => n.id === node.id)) this.nodes.push(node); }
  list()      { return this.nodes; }
}

module.exports = new Bootstrap();
