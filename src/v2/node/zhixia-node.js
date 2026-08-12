'use strict';

const Config = require('./config');
const Identity = require('./identity');
const PeerManager = require('../peer/peer-manager');
const Discovery = require('../discovery/discovery');
const ConnectionStrategy = require('../connection/strategy');
const Message = require('../message/message');
const PortManager = require('../network/port-manager');

class ZhixiaNode {
    constructor(options = {}) {
        this.config = new Config(options);
        this.name = this.config.name;
        this.port = this.config.port;

        this.identity = new Identity({ dataDir: this.config.dataDir });
        this.portManager = new PortManager({ startPort: this.port });
        this.peers = null;
        this.discovery = null;
        this.connection = null;
        this.message = null;

        this.running = false;
    }

    async start() {
        if (this.running) return;

        await this.identity.load();
        this.port = await this.portManager.findAvailable();

        this.peers = new PeerManager({ nodeId: this.identity.id });
        this.message = new Message({ node: this });
        this.connection = new ConnectionStrategy({
            node: this,
            peerManager: this.peers,
            tor: this.config.transport.tor
        });
        this.discovery = new Discovery({ node: this });

        // 顺序：先开 TCP 监听，再启动 NAT + DHT 发现
        await this.message.start(this.port);
        await this.connection.start();
        await this.discovery.start();

        this.running = true;

        console.log('');
        console.log('==============================================');
        console.log(`  Zhixia Node Online [${this.name}]`);
        console.log(`  Identity : ${this.identity.id}`);
        console.log(`  Port     : ${this.port}`);
        console.log(`  Peers    : ${this.peers.count()}`);
        console.log('==============================================');
    }

    async stop() {
        this.running = false;
        if (this.discovery) await this.discovery.stop();
        if (this.connection) await this.connection.stop();
        if (this.message) await this.message.stop();
        console.log(`[node] ${this.name} offline.`);
    }

    async sendMessage(targetPeerId, text) {
        const peer = this.peers.get(targetPeerId);
        if (!peer) {
            throw new Error(`Target peer ${targetPeerId} not found in routing table`);
        }

        // 确保 A 自己也注册了这个 socket（出站方向）
        if (peer.socket) {
            this.message.registerPeer(targetPeerId, peer.socket);
        }

        // 如果已有 socket，直接发
        if (peer.socket && peer.socket.writable) {
            return this.message.send(peer.id, 'CHAT', { text });
        }

        // 否则先直连
        const conn = await this.connection.connect(peer);
        if (!conn.success) {
            throw new Error(`Failed to establish connection to ${targetPeerId}: ${conn.reason}`);
        }

        peer.socket = conn.connection.socket;
        this.message.registerPeer(peer.id, conn.connection.socket);

        return this.message.send(peer.id, 'CHAT', { text });
    }

    // 手动添加 peer 并尝试连接（用于 CLI / 外部发现）
    async addPeer(peerId, addresses) {
        const peer = this.peers.add({ id: peerId, addresses });
        if (!peer) return { ok: false, reason: 'invalid' };

        const conn = await this.connection.connect(peer);
        if (!conn.success) {
            this.peers.remove(peerId);
            return { ok: false, reason: conn.reason };
        }

        peer.socket = conn.connection.socket;
        this.message.registerPeer(peerId, conn.connection.socket);
        return { ok: true, strategy: conn.strategy || 'tcp-direct' };
    }
}

module.exports = ZhixiaNode;
