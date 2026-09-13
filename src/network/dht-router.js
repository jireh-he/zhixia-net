// v1.3 — DHT Router（基于 Kademlia DHTNode）
const crypto = require('crypto');
const { sha1Id, xor, DHTNode } = require('./dht');

class DHTRouter {
  constructor() {
    this.selfId = null;
    this.selfIp = null;
    this.node = null;
  }

  // 初始化本地 DHT 节点
  init(selfId, selfIp) {
    this.selfId = selfId;
    this.selfIp = selfIp;
    this.node = new DHTNode(sha1Id(selfId), selfIp);
    return this.node;
  }

  // 注册一个用户到 DHT
  registerUser(username, ipAddr) {
    if (!this.node) return false;
    this.node.announceUser(username, ipAddr);
    return true;
  }

  // 查找用户 IP
  findUser(username) {
    if (!this.node) return null;
    const result = this.node.findUser(username);
    if (typeof result === 'string') return result;
    return result.ip || null;
  }

  // 查找最近节点
  findNearest(username) {
    if (!this.node) return [];
    const targetId = sha1Id(username);
    return this.node.routingTable.getClosest(targetId);
  }

  // 注册一个节点到路由表
  registerNode(nodeId, ipAddr) {
    if (!this.node) return false;
    const { RoutingEntry } = require('./dht');
    this.node.routingTable.update(new RoutingEntry(sha1Id(nodeId), ipAddr));
    return true;
  }

  // 获取所有已知节点
  listNodes() {
    if (!this.node) return [];
    return this.node.listNodes();
  }

  // 获取所有 KV 映射
  listKV() {
    if (!this.node) return {};
    return this.node.listKV();
  }

  // 统计信息
  stats() {
    if (!this.node) return { initialized: false };
    return { initialized: true, ...this.node.stats() };
  }

  // 设置 peer 回调（用于分布式查找）
  setPeerCallback(callback) {
    if (this.node) this.node.peerCallback = callback;
  }
}

module.exports = new DHTRouter();
