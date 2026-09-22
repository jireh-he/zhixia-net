// v0.6.2 Node Routing — zid → 节点定位
const discovery = require('./discovery-service');

class NodeRouting {
  findIdentity(zid) { return discovery.lookup(zid); }
  announce(identity, node) {
    discovery.announce({ id: identity.id, address: node.address, capabilities: node.capabilities });
  }
}

module.exports = new NodeRouting();
