// Phase 12 — NAT Manager
const stun = require('./stun');
const relay = require('./relay');

class NATManager {
  constructor() { this.strategy = 'auto'; }

  async connect(peer) {
    if (this.strategy === 'direct') return this.direct(peer);
    if (this.strategy === 'relay')  return relay.connect(peer);

    const info = stun.detect();
    if (info.natType === 'open' || info.natType === 'restricted') return this.direct(peer);
    return relay.connect(peer);
  }

  direct(peer) {
    return { mode: 'direct', peer: peer.id, address: peer.address, nat: stun.lastDetect };
  }

  status() {
    return { strategy: this.strategy, direct: stun.canDirectConnect(), relayReady: true };
  }
}

module.exports = new NATManager();
