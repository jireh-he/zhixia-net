'use strict';

const dgram = require('dgram');

class HolePunch {
    constructor(options = {}) {
        this.node = options.node;
        this.socket = null;
        this.running = false;
        this.activePunches = new Map();
    }

    async start() {
        if (this.running) return;
        this.running = true;

        this.socket = dgram.createSocket('udp4');
        this.socket.on('message', (msg, remote) => {
            this.handlePunchMessage(msg, remote);
        });

        await new Promise(resolve => this.socket.bind(0, resolve));
    }

    async stop() {
        this.running = false;
        if (this.socket) this.socket.close();
    }

    async connect(peer) {
        if (!peer.addresses || peer.addresses.length === 0) {
            return { success: false, reason: 'no candidate address' };
        }

        const candidate = peer.addresses.find(a => a.type === 'ipv4' || a.family === 'ipv4');
        if (!candidate) {
            return { success: false, reason: 'no ipv4 target for nat punch' };
        }

        const punchPayload = Buffer.from(JSON.stringify({
            type: 'ZHIXIA_PUNCH_SYN',
            from: this.node.identity.id,
            timestamp: Date.now()
        }));

        return new Promise((resolve) => {
            let attempts = 0;
            const maxAttempts = 6;
            const interval = 400;

            const timer = setInterval(() => {
                attempts++;
                this.socket.send(punchPayload, candidate.port, candidate.host);

                if (attempts >= maxAttempts) {
                    clearInterval(timer);
                    resolve({ success: false, reason: 'hole punch timeout' });
                }
            }, interval);

            this.activePunches.set(peer.id, (remote) => {
                clearInterval(timer);
                this.activePunches.delete(peer.id);
                resolve({
                    success: true,
                    transport: 'nat-quic',
                    endpoint: { host: remote.address, port: remote.port }
                });
            });
        });
    }

    handlePunchMessage(msg, remote) {
        let data;
        try {
            data = JSON.parse(msg.toString());
        } catch {
            return;
        }

        if (data.type === 'ZHIXIA_PUNCH_SYN') {
            const ack = Buffer.from(JSON.stringify({
                type: 'ZHIXIA_PUNCH_ACK',
                from: this.node.identity.id
            }));
            this.socket.send(ack, remote.port, remote.address);
        } else if (data.type === 'ZHIXIA_PUNCH_ACK') {
            const handler = this.activePunches.get(data.from);
            if (handler) {
                handler(remote);
            }
        }
    }
}

module.exports = HolePunch;