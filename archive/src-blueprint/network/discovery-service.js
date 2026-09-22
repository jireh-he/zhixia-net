// v1.3 — Discovery Service（基于 Kademlia DHT）
// announce: 注册用户到 DHT 网络
// lookup: 查找用户 IP（本地缓存 → 分布式查找）
// list: 返回所有已知节点
const router = require('./dht-router');

class DiscoveryService {
  announce(node) {
    return router.registerNode(node.id, node.ip || node.address);
  }

  announceUser(username, ip) {
    return router.registerUser(username, ip);
  }

  lookup(id) {
    // 优先本地查找
    const kv = router.listKV();
    for (const [k, v] of Object.entries(kv)) {
      if (k === id || k.includes(id)) return v;
    }
    // 分布式查找
    return router.findUser(id);
  }

  list() {
    return router.listNodes();
  }

  stats() {
    return router.stats();
  }
}

module.exports = new DiscoveryService();
