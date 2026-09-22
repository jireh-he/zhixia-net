// v1.1 — Discovery 三层：Bootstrap → Peer Exchange → DHT
// 纯 P2P，无 Relay。Bootstrap 只提供 discovery，不参与消息路径。
const bootstrap = require('./bootstrap');
const peerExchange = require('./peer-exchange');
const dht = require('./dht');
const peerManager = require('./peer-manager');

class Discovery {
  constructor() { this.bootstrapUrl = null; }

  setBootstrap(url) { this.bootstrapUrl = url; }

  // 第一层：问 Bootstrap 要 peer 地址
  async fromBootstrap() {
    if (!this.bootstrapUrl) return { peers: [] };
    return { from: 'bootstrap', peers: [] };
  }

  // 第二层：从已连的 peer 要更多 peer（PEX）
  fromPeerExchange(peerId) {
    return peerExchange.getKnownPeers(20);
  }

  // 第三层：DHT 查找
  fromDHT(target) {
    const result = dht.table.get(target);
    return result ? { from: 'dht', id: target, address: result } : null;
  }

  // 注册自身
  register(id, addresses) {
    peerExchange.addPeer(id, addresses);
    dht.table.set(id, { id, addresses, ts: Date.now() });
    return true;
  }

  // 收到 peer 推荐
  receivePeers(peers) {
    return peerExchange.processPeerList(peers);
  }

  status() {
    return {
      bootstrap: this.bootstrapUrl,
      exchange: [...peerExchange.known.entries()].length,
      dht: dht.table.size,
      connected: peerManager.status().connected
    };
  }
}

module.exports = new Discovery();
