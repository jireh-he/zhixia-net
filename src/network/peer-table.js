// v1.1 — Peer Table（状态机）
const states = { DISCOVERED: 0, CONNECTING: 1, CONNECTED: 2, DISCONNECTED: 3, BANNED: 4 };

class PeerTable {
  constructor() { this.peers = new Map(); }

  add(id, { addresses, transport }) {
    this.peers.set(id, {
      id,
      addresses,
      transport,
      direction: 'inbound',
      state: states.DISCOVERED,
      lastSeen: Date.now()
    });
    return this.peers.get(id);
  }

  get(id) { return this.peers.get(id); }
  remove(id) { this.peers.delete(id); }

  setConnected(id) {
    const p = this.peers.get(id);
    if (p) { p.state = states.CONNECTED; p.lastSeen = Date.now(); }
  }

  setDisconnected(id) {
    const p = this.peers.get(id);
    if (p) p.state = states.DISCONNECTED;
  }

  ban(id) {
    const p = this.peers.get(id);
    if (p) p.state = states.BANNED;
  }

  connected() {
    const out = [];
    for (const p of this.peers.values()) {
      if (p.state === states.CONNECTED) out.push(p);
    }
    return out;
  }

  find(id) {
    const p = this.peers.get(id);
    return p && p.state === states.CONNECTED ? p : null;
  }

  list() {
    return [...this.peers.values()].map(p => ({
      id: p.id,
      state: Object.keys(states).find(k => states[k] === p.state),
      transport: p.transport,
      lastSeen: p.lastSeen
    }));
  }
}

module.exports = new PeerTable();
