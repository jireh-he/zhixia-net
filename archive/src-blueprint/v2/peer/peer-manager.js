'use strict';

module.exports = class PeerManager {
    constructor(opts = {}) {
        this.nodeId = opts.nodeId || null;
        this.peers = new Map(); // id -> {id, addresses, socket, ts}
    }

    get(id) { return this.peers.get(id); }
    list() { return Array.from(this.peers.values()).map(p => ({ id: p.id, addresses: p.addresses, ts: p.ts })); }
    count() { return this.peers.size; }

    add(peer) {
        const id = peer.id;
        if (!id) return;
        this.peers.set(id, { id, addresses: peer.addresses || [], socket: peer.socket || null, ts: Date.now() });
        return this.peers.get(id);
    }

    remove(id) {
        if (this.peers.get(id)) {
            this.peers.get(id).socket?.destroy();
            this.peers.delete(id);
        }
    }
};
