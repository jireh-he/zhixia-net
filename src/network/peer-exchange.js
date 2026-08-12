// v1.1 — Peer Exchange（A 连 B 后，B 告诉 A 自己认识的 C/D/E，A 直接连）
// 网络自己扩张。PEX 不参与消息转发，只广播 peer 地址。
class PeerExchange {
  constructor() { this.known = new Map(); }

  addPeer(id, addresses) { this.known.set(id, { addresses, addedAt: Date.now() }); }
  removePeer(id) { this.known.delete(id); }

  // A 向 B 要 peer 列表
  getKnownPeers(max = 20) {
    const out = [];
    let count = 0;
    for (const [id, p] of this.known) {
      if (count >= max) break;
      out.push({ id, addresses: p.addresses });
      count++;
    }
    return { peers: out };
  }

  // 处理 PEX 消息（收到对方推荐的 peer，直接加入自己的 peer table）
  processPeerList(peers) {
    for (const p of (peers || [])) {
      this.addPeer(p.id, p.addresses);
    }
    return peers ? peers.length : 0;
  }
}

module.exports = new PeerExchange();
