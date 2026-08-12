'use strict';

const dgram = require('dgram');
const crypto = require('crypto');
const bencode = require('../../../node_modules/bencode/index.js').default;

const BOOTSTRAP_DHT_ROUTERS = [
    { host: 'router.bittorrent.com', port: 6881 },
    { host: 'dht.transmissionbt.com', port: 6881 },
    { host: 'router.utorrent.com', port: 6881 }
];

class BitTorrentDHT {
    constructor(options = {}) {
        this.node = options.node;
        this.socket = null;
        this.running = false;
        this.nodeId = crypto.randomBytes(20);
        this.infoHash = crypto.createHash('sha1').update('zhixia:p2p:v2:network').digest();
        this.discoveredPeers = new Map();
    }

    async start() {
        if (this.running) return;
        this.running = true;

        this.socket = dgram.createSocket('udp4');
        this.socket.on('message', (msg) => this.handleMessage(msg));

        await new Promise(resolve => this.socket.bind(0, resolve));

        console.log('[bt-dht] Bootstrapping DHT discovery ring...');
        this.bootstrap();
    }

    async stop() {
        this.running = false;
        if (this.socket) this.socket.close();
    }

    bootstrap() {
        for (const router of BOOTSTRAP_DHT_ROUTERS) {
            this.sendFindNode(router.host, router.port, this.nodeId);
        }
        setInterval(() => {
            if (!this.running) return;
            for (const router of BOOTSTRAP_DHT_ROUTERS) {
                this.sendGetPeers(router.host, router.port, this.infoHash);
            }
        }, 15000);
    }

    sendFindNode(host, port, target) {
        const query = {
            t: crypto.randomBytes(2),
            y: 'q',
            q: 'find_node',
            a: {
                id: this.nodeId,
                target: target
            }
        };
        const buffer = bencode.encode(query);
        this.socket.send(buffer, port, host, () => {});
    }

    sendGetPeers(host, port, infoHash) {
        const query = {
            t: crypto.randomBytes(2),
            y: 'q',
            q: 'get_peers',
            a: {
                id: this.nodeId,
                info_hash: infoHash
            }
        };
        const buffer = bencode.encode(query);
        this.socket.send(buffer, port, host, () => {});
    }

    handleMessage(buffer) {
        let msg;
        try {
            msg = bencode.decode(buffer);
        } catch {
            return;
        }

        if (msg.y && msg.y.toString() === 'r' && msg.r) {
            if (msg.r.values && Array.isArray(msg.r.values)) {
                for (const peerBuf of msg.r.values) {
                    if (peerBuf.length === 6) {
                        const ip = `${peerBuf[0]}.${peerBuf[1]}.${peerBuf[2]}.${peerBuf[3]}`;
                        const port = peerBuf.readUInt16BE(4);
                        const id = `zid:dht:${ip}:${port}`;
                        this.discoveredPeers.set(id, {
                            id,
                            addresses: [{ host: ip, port: port, type: 'ipv4' }],
                            transport: 'quic',
                            state: 'DISCOVERED'
                        });
                    }
                }
            }
        }
    }

    async findPeers() {
        return Array.from(this.discoveredPeers.values());
    }

    addPeer(peer) {
        if (peer && peer.id) {
            this.discoveredPeers.set(peer.id, peer);
        }
    }
}

module.exports = BitTorrentDHT;