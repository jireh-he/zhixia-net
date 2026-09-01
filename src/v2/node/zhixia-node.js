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
            tor: this.config.transport.tor,
            signalingUrl: this.config.transport.webrtc.signalingUrl,
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

    async sendMessage(target, text) {
        // 三种 target 形式：
        //   1. 'zid:xxxxxx' — PeerManager 里已有的 peer id（走原 TCP 路径）
        //   2. '<64 hex>'    — 完整 publicKey，走 hyperdht 加密连接
        //   3. '<16 hex>'    — 短 publicKey 前缀，先在本地 peers 表找
        const isHex64 = /^[0-9a-fA-F]{64}$/.test(target);
        const isHex16 = /^[0-9a-fA-F]{16}$/.test(target);

        if (isHex64) {
            return this._sendViaHyperdht(target, text);
        }

        // 短 publicKey 前缀 → 查 PeerManager
        if (isHex16) {
            const found = this.peers.list().find(p => p.id.endsWith(target));
            if (found) return this._sendToPeer(found.id, text);
        }

        // 普通 peer id（zid:xxx）
        return this._sendToPeer(target, text);
    }

    /**
     * 通过 hyperdht 加密通道发送消息
     * target: 32B publicKey 的 hex 字符串
     */
    async _sendViaHyperdht(publicKeyHex, text) {
        if (!this.discovery || !this.discovery.client) {
            throw new Error('hyperdht discovery not available');
        }

        const peerId = `hyper:${publicKeyHex.slice(0, 24)}`;
        const publicKey = Buffer.from(publicKeyHex, 'hex');

        // 已有加密 stream？直接发
        if (this.message.peers.has(peerId)) {
            return this.message.send(peerId, 'CHAT', { text });
        }

        // 先 findPeer 拿地址信息（可选，hyperdht.connect 会自动从 DHT 找）
        const found = await this.discovery.findPeer(publicKey, 15000);
        if (!found) {
            throw new Error(`peer not found in hyperdht DHT: ${publicKeyHex.slice(0, 16)}...`);
        }

        // 建立加密连接
        const conn = await this.connection.connect({
            id: peerId,
            publicKey,
            addresses: found.addresses || [],
        });
        if (!conn.success) {
            throw new Error(`hyperdht connect failed: ${conn.reason}`);
        }

        const stream = conn.connection.socket;
        this.message.registerStream(peerId, stream);

        // 写入 PeerManager
        this.peers.add({
            id: peerId,
            publicKey,
            addresses: found.addresses || [],
            family: 'hyperdht',
            transport: 'noise',
        });

        return this.message.send(peerId, 'CHAT', { text });
    }

    /**
     * 走原 TCP 路径发消息（peer 已在 PeerManager）
     */
    async _sendToPeer(targetPeerId, text) {
        const peer = this.peers.get(targetPeerId);
        if (!peer) {
            throw new Error(`Target peer ${targetPeerId} not found in routing table`);
        }

        if (peer.socket && peer.socket.writable) {
            return this.message.send(peer.id, 'CHAT', { text });
        }

        const conn = await this.connection.connect(peer);
        if (!conn.success) {
            throw new Error(`Failed to establish connection to ${targetPeerId}: ${conn.reason}`);
        }

        peer.socket = conn.connection.socket;
        if (conn.connection.transport === 'noise') {
            this.message.registerStream(peer.id, conn.connection.socket);
        } else {
            this.message.registerPeer(peer.id, conn.connection.socket);
        }

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
