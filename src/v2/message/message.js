'use strict';

const net = require('net');

module.exports = class Message {
    constructor(opts = {}) {
        this.node = opts.node || null;
        this.server = null;
        this.peers = new Map(); // id -> socket
        this.router = {
            handlers: {},
            register: (type, cb) => { this.router.handlers[type] = cb; }
        };
    }

    async start(port) {
        this.server = net.createServer((socket) => this._handleConnection(socket));
        this.server.listen(port, '0.0.0.0', () => {
            console.log(`[msg] TCP listener on :${this.server.address().port}`);
        });
    }

    async stop() {
        if (this.server) { this.server.close(); this.server = null; }
    }

    // 注册一个已连接的 peer（sendMessage 路径）
    registerPeer(id, socket) {
        this.peers.set(id, socket);
        socket.on('close', () => this.peers.delete(id));
    }

    // 通过 TCP 发送消息
    async send(peerId, type, data) {
        const socket = this.peers.get(peerId);
        if (!socket) throw new Error(`no connection to ${peerId}`);
        const payload = JSON.stringify({ type, from: this.node.identity.id, data }) + '\n';
        if (socket.writable) {
            socket.write(payload);
            return { ok: true, bytes: payload.length };
        }
        throw new Error(`connection to ${peerId} closed`);
    }

    _handleConnection(socket) {
        let peerId = null;
        let buf = '';

        socket.on('data', (chunk) => {
            buf += chunk.toString();
            while (true) {
                const idx = buf.indexOf('\n');
                if (idx === -1) break;
                const line = buf.slice(0, idx).trim();
                buf = buf.slice(idx + 1);
                if (!line) continue;
                try {
                    const msg = JSON.parse(line);
                    if (msg.type === 'REGISTER') {
                        peerId = msg.id;
                        this.peers.set(peerId, socket);
                        socket.on('close', () => this.peers.delete(peerId));
                        socket.write(JSON.stringify({ type: 'ACK', from: this.node.identity.id, ts: Date.now() }) + '\n');
                        console.log('[msg] peer registered: ' + peerId);
                    } else if (msg.type === 'CHAT') {
                        const h = this.router.handlers['CHAT'];
                        if (h) h({ from: peerId || msg.from, to: this.node.identity.id, payload: msg.data, ts: Date.now() });
                    } else if (msg.type === 'PING') {
                        socket.write(JSON.stringify({ type: 'PONG', from: this.node.identity.id, ts: Date.now() }) + '\n');
                    }
                } catch (e) {
                    // skip malformed
                }
            }
        });

        socket.on('error', () => {});
        socket.on('close', () => {
            if (peerId) this.peers.delete(peerId);
        });
    }
};
