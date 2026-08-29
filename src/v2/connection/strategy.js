'use strict';

const net = require('net');
const NAT = require('./nat');

module.exports = class ConnectionStrategy {
    constructor(opts = {}) {
        this.node = opts.node || null;
        this.nat = new NAT({ node: this.node });
        this.quic = {
            send: async (peerId, data) => {
                if (this.node && this.node.message) {
                    return this.node.message.send(peerId, 'QUIC_DATA', data);
                }
                return { ok: false, reason: 'quic-not-implemented' };
            }
        };
    }

    async start() { await this.nat.start(); }
    async stop() { await this.nat.stop(); }

    /**
     * 连接一个 peer，策略优先级：
     *   1. hyperdht.connect（peer.publicKey 存在时）— noise 加密 + 自动打洞
     *   2. TCP 直连（fallback，兼容旧 peer）
     *
     * 返回：{ success, strategy, connection: { id, socket, addresses } }
     * socket 对 hyperdht 是 stream，对 TCP 是 net.Socket；
     * 都支持 write / on('data') / on('error') / on('close') / destroy()。
     */
    async connect(peer) {
        // ── 策略 1: hyperdht 加密直连 ──
        if (peer.publicKey && this.node && this.node.discovery && this.node.discovery.client) {
            try {
                const socket = await this._connectHyper(peer.publicKey, peer.id);
                return {
                    success: true,
                    strategy: 'hyperdht',
                    connection: {
                        id: peer.id,
                        socket,
                        addresses: peer.addresses,
                        publicKey: peer.publicKey,
                        transport: 'noise'
                    }
                };
            } catch (e) {
                if (process.env.DEBUG_ZHIXIA) {
                    console.log(`[connection] hyperdht failed: ${e.message}, fallback to TCP`);
                }
                // 继续走 TCP
            }
        }

        // ── 策略 2: TCP 直连 ──
        return this._connectTCP(peer);
    }

    _connectTCP(peer) {
        const addr = peer.addresses?.[0];
        if (!addr) return Promise.resolve({ success: false, reason: 'no address' });

        // 支持两种格式：
        //   - { host: 'x.x.x.x', port: 1234 }（hyperdht 风格对象）
        //   - '/ip4/x.x.x.x/tcp/PORT'（libp2p 风格字符串）
        let host = addr.host, port = addr.port;
        if (typeof addr === 'string') {
            const m4 = addr.match(/\/ip4\/([^\s\/]+)\/tcp\/(\d+)/);
            const m6 = addr.match(/\/ip6\/\]?([^\/\]]+)\]?\/(\d+)/);
            if (m4) { host = m4[1]; port = parseInt(m4[2], 10); }
            else if (m6) { host = m6[1]; port = parseInt(m6[2], 10); }
        }
        if (!host || !port || port < 1) {
            return Promise.resolve({ success: false, reason: 'bad address' });
        }

        const socket = net.createConnection({ host, port }, () => {
            socket.write(JSON.stringify({
                type: 'REGISTER',
                id: this.node.identity.id,
                addresses: [addr]
            }) + '\n');
        });

        socket.on('error', () => { socket.destroy(); });
        socket.setTimeout(5000);
        socket.on('timeout', () => { socket.destroy(); });

        return new Promise((resolve) => {
            socket.on('data', (d) => {
                try {
                    const msg = JSON.parse(d.toString().trim().split('\n')[0]);
                    if (msg.type === 'ACK') {
                        socket.on('error', () => {});
                        resolve({
                            success: true,
                            strategy: 'tcp-direct',
                            connection: { id: peer.id, socket, addresses: peer.addresses }
                        });
                    }
                } catch (e) {}
            });

            socket.on('error', () => resolve({ success: false, reason: 'connect-failed' }));
            socket.on('timeout', () => resolve({ success: false, reason: 'timeout' }));
        });
    }

    /**
     * 用 hyperdht.connect() 建立 noise 加密通道
     * 返回的 stream 支持 write / on('data') / on('error') / on('close') / destroy()
     */
    _connectHyper(peerPublicKey, peerId, timeoutMs = 15000) {
        const dht = this.node.discovery.client;
        return new Promise((resolve, reject) => {
            let settled = false;
            const socket = dht.connect(peerPublicKey, {
                timeout: timeoutMs,
                serverPublicKey: peerPublicKey
            });

            const cleanup = () => { try { socket.destroy(); } catch {} };

            socket.once('connect', () => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve(socket);
            });
            socket.on('error', (e) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                reject(e);
            });
            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                cleanup();
                reject(new Error('hyperdht connect timeout'));
            }, timeoutMs + 1000);
            if (timer.unref) timer.unref();
        });
    }

    async send(peerId, data) {
        return this.quic.send(peerId, data);
    }
};
