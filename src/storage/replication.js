// Phase 13 — 复制模块
class Replication {
  constructor(factor = 3) { this.factor = factor; }

  selectNodes(peers) { return peers.slice(0, this.factor); }

  replicate(content, peers, chunkStore) {
    const selected = this.selectNodes(peers);
    const promises = selected.map(p => ({
      peer: p.id,
      chunks: content.chunkIds || [],
      cid: content.cid,
      status: 'assigned'
    }));
    return { target: selected.length, assignments: promises };
  }

  check(cid, knownPeers) {
    const count = knownPeers.filter(p => p.has(cid)).length;
    return { have: count, need: Math.max(0, this.factor - count), satisfied: count >= this.factor };
  }
}

module.exports = new Replication();
