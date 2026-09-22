// v0.6.0 Peer Manager
class PeerManager {
  constructor() { this.peers = new Map(); }
  add(id, peer) { this.peers.set(id, peer); }
  remove(id)   { this.peers.delete(id); }
  get(id)      { return this.peers.get(id); }
  list()       { return [...this.peers.values()]; }
  keys()       { return [...this.peers.keys()]; }
}

module.exports = new PeerManager();
