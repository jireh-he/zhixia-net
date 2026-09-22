// Trust: Graph — 信任关系图（去中心化网络拓扑）
// 不是列表，是图：A->B +5, C->A +3, A->C -1
class TrustGraph {
  constructor() {
    this.edges = [];
  }

  add(attestation) {
    this.edges.push({
      from: attestation.from,
      to: attestation.target,
      value: attestation.value,
      type: attestation.type,
      createdAt: attestation.createdAt
    });
  }

  neighbors(user) {
    return this.edges.filter(e => e.from === user || e.to === user);
  }

  incoming(user) {
    return this.edges.filter(e => e.to === user);
  }

  outgoing(user) {
    return this.edges.filter(e => e.from === user);
  }
}

module.exports = new TrustGraph();
