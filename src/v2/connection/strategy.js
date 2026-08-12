'use strict';

const net = require('net');
const NAT = require('./nat');

module.exports = class ConnectionStrategy {
    constructor(opts = {}) {
        this.node = opts.node || null;
        this.nat = new NAT({ node: this.node });
        this.quic = { send: async (peerId, data) => {
            // QUIC 未实现，回退 TCP
            if (this.node && this.node.message) {
                return this.node.message.send(peerId, 'QUIC_DATA', data);
            }
            return { ok: false, reason: 'quic-not-implemented' };
        }};
    }

    async start() { await this.nat.start(); }
    async stop() { await this.nat.stop(); }

    // 通过 TCP 直连目标 peer
    async connect(peer) {
        const addr = peer.addresses?.[0];
        if (!addr) return { success: false, reason: 'no address' };

        // 解析 /ip4/x.x.x.x/tcp/PORT 格式
        let host, port;
        const m4 = addr.match(/\/ip4\/([^\/]+)\/tcp\/(\d+)/);
        const m6 = addr.match(/\/ip6\/\[?([^\/\]]+)\]?\//);
        if (m4) { host = m4[1]; port = parseInt(m4[2], 10); }
        else if (m6) { host = m6[1]; port = 9001; }
        else { return { success: false, reason: 'unsupported addr' }; }

        if (!port || port < 1) return { success: false, reason: 'no port' };

        const socket = net.createConnection({ host, port }, () => {
            // 注册身份
            socket.write(JSON.stringify({
                type: 'REGISTER',
                id: this.node.identity.id,
                addresses: [addr]
            }) + '\n');
        });

        socket.on('error', (e) => {
            socket.destroy();
        });

        socket.setTimeout(5000);
        socket.on('timeout', () => { socket.destroy(); });

        return new Promise((resolve) => {
            socket.on('data', (d) => {
                try {
                    const msg = JSON.parse(d.toString().trim().split('\n')[0]);
                    if (msg.type === 'ACK') {
                        socket.on('error', () => {});
                        resolve({ success: true, connection: { id: peer.id, socket, addresses: peer.addresses } });
                    }
                } catch (e) {}
            });

            socket.on('error', () => {
                resolve({ success: false, reason: 'connect-failed' });
            });

            socket.on('timeout', () => {
                resolve({ success: false, reason: 'timeout' });
            });
        });
    }

    // 通过 QUIC 发送（回退 TCP）
    async send(peerId, data) {
        return this.quic.send(peerId, data);
    }
};
