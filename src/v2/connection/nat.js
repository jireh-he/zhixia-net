'use strict';

const os = require('os');
const dgram = require('dgram');

const PUBLIC_STUN_SERVERS = [
    { host: 'stun.l.google.com', port: 19302 },
    { host: 'stun1.l.google.com', port: 19302 }
];

class NAT {
    constructor(options = {}) {
        this.node = options.node;
        this.info = {
            localIPv4: [],
            localIPv6: [],
            publicIPv4: null,
            publicPort: null,
            natType: 'Unknown',
            udpSupported: false
        };
    }

    async start() {
        this.detectLocalInterfaces();
        await this.detectPublicEndpoint();
        console.log('[nat] Network profile resolved:');
        console.log(`  - Local IPv4: ${this.info.localIPv4.join(', ') || 'none'}`);
        console.log(`  - Local IPv6: ${this.info.localIPv6.join(', ') || 'none'}`);
        console.log(`  - Public Endpoint: ${this.info.publicIPv4 ? `${this.info.publicIPv4}:${this.info.publicPort}` : 'unresolved'}`);
        console.log(`  - NAT Type: ${this.info.natType}`);
    }

    async stop() {}

    detectLocalInterfaces() {
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const item of interfaces[name]) {
                if (item.internal) continue;
                if (item.family === 'IPv4') {
                    this.info.localIPv4.push(item.address);
                } else if (item.family === 'IPv6') {
                    this.info.localIPv6.push(item.address);
                }
            }
        }
    }

    async detectPublicEndpoint() {
        return new Promise(resolve => {
            const socket = dgram.createSocket('udp4');
            const target = PUBLIC_STUN_SERVERS[0];

            const stunRequest = Buffer.alloc(20);
            stunRequest.writeUInt16BE(0x0001, 0);
            stunRequest.writeUInt16BE(0x0000, 2);
            stunRequest.writeUInt32BE(0x2112A442, 4);
            for (let i = 8; i < 20; i++) stunRequest[i] = Math.floor(Math.random() * 256);

            const timer = setTimeout(() => {
                this.info.natType = 'Symmetric/Blocked';
                socket.close();
                resolve(this.info);
            }, 3000);

            socket.on('message', (msg) => {
                clearTimeout(timer);
                this.info.udpSupported = true;
                if (msg.length >= 20) {
                    let offset = 20;
                    while (offset < msg.length) {
                        const attrType = msg.readUInt16BE(offset);
                        const attrLen = msg.readUInt16BE(offset + 2);
                        if (attrType === 0x0020 && attrLen >= 8) {
                            const port = msg.readUInt16BE(offset + 6) ^ 0x2112;
                            const ipParts = [];
                            for (let i = 0; i < 4; i++) {
                                ipParts.push(msg.readUInt8(offset + 8 + i) ^ (0x2112A442 >> ((3 - i) * 8) & 0xFF));
                            }
                            this.info.publicIPv4 = ipParts.join('.');
                            this.info.publicPort = port;
                            this.info.natType = 'Full Cone / Restricted';
                            break;
                        }
                        offset += 4 + attrLen;
                    }
                }
                socket.close();
                resolve(this.info);
            });

            socket.on('error', () => {
                clearTimeout(timer);
                socket.close();
                resolve(this.info);
            });

            socket.send(stunRequest, target.port, target.host);
        });
    }

    getInfo() {
        return this.info;
    }
}

module.exports = NAT;