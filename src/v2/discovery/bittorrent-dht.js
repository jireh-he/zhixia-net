'use strict';

const dgram = require('dgram');
const crypto = require('crypto');
const path = require('path');
// bencode@3 exports 限制：必须用绝对路径 + .default
const bencode = require(path.join(__dirname, '../../../node_modules/bencode/index.js')).default;

const BOOTSTRAP_DHT_ROUTERS = [
    { host: 'router.bittorrent.com', port: 6881 },
    { host: 'dht.transmissionbt.com', port: 6881 },
    { host: 'router.utorrent.com', port: 6881 }
];

// bencode@3 的 decode 会把字符串解成 {index: byteValue} 的 map，
// 不解成 Buffer。必须显式转回 Buffer 才能按字节读。
function toBuffer(v) {
    if (Buffer.isBuffer(v)) return v;
    if (Array.isArray(v)) return Buffer.from(v);
    if (v && typeof v === 'object') {
        const keys = Object.keys(v);
        const len = keys.length;
        const out = Buffer.allocUnsafe(len);
        for (let i = 0; i < len; i++) out[i] = Number(v[keys[i]]) & 0xff;
        return out;
    }
    if (typeof v === 'number') return Buffer.from([v & 0xff]);
    if (typeof v === 'string') return Buffer.from(v, 'utf8');
    return Buffer.alloc(0);
}

function strFrom(v) {
    if (typeof v === 'number') return String.fromCharCode(v);
    if (Buffer.isBuffer(v)) return v.toString('latin1');
    if (Array.isArray(v)) return Buffer.from(v).toString('latin1');
    if (v && typeof v === 'object') {
        try { return toBuffer(v).toString('latin1'); } catch { return ''; }
    }
    return String(v);
}

// 拆 nodes 字段：26B/entry (id 20 + ip 4 + port 2)
function decodeNodes(raw) {
    const buf = toBuffer(raw);
    const step = 26;
    const out = [];
    for (let i = 0; i + step <= buf.length; i += step) {
        const id = buf.slice(i, i + 20);
        const ip = `${buf[i + 20]}.${buf[i + 21]}.${buf[i + 22]}.${buf[i + 23]}`;
        const port = buf.readUInt16BE(i + 24);
        if (port === 0) continue;
        out.push({ id: id.toString('hex'), ip, port, family: 'ipv4' });
    }
    return out;
}

// 拆 nodes6 字段：38B/entry (id 20 + ipv6 16 + port 2)
// 注：libtorrent 有时会在 head 加 4B 版本前缀，兼容两种
function decodeNodes6(raw) {
    const buf = toBuffer(raw);
    const out = [];
    // 先尝试 4B 前缀（libtorrent 常见），再尝试无前缀
    for (const offset of [4, 0]) {
        const body = buf.slice(offset);
        const step = 38;
        if (body.length < step) continue;
        const entries = [];
        for (let i = 0; i + step <= body.length; i += step) {
            const id = body.slice(i, i + 20);
            const ipv6 = body.slice(i + 20, i + 36);
            const port = body.readUInt16BE(i + 36);
            const addr = [...ipv6].map((b, idx) => {
                // 简单渲染，用 ":" 分隔每 2 字节
                if (idx % 2 === 0 && idx > 0) return ':';
                return b.toString(16).padStart(2, '0');
            }).join('');
            if (port === 0) continue;
            entries.push({ id: id.toString('hex'), ip: addr, port, family: 'ipv6' });
        }
        if (entries.length) { out.push(...entries); break; }
    }
    return out;
}

class BitTorrentDHT {
    constructor(options = {}) {
        this.node = options.node;
        this.socket = null;
        this.running = false;
        this.nodeId = options.nodeId || crypto.randomBytes(20);
        // info_hash：DHT 里没种子时 get_peers 会返 nodes 而不返 values，
        // 所以 DHT 环扩散依赖 find_node；info_hash 主要用来做 get_peers 查询。
        // 保留 zhixia 专属 namespace，可被外部通过 setInfoHash 覆盖。
        this.infoHash = options.infoHash
            || crypto.createHash('sha1').update('zhixia:p2p:v2:network').digest();
        this.discoveredPeers = new Map();
        this._rxCount = 0;
        this._txCount = 0;
        this._errors = [];
    }

    async start() {
        if (this.running) return;
        this.running = true;

        this.socket = dgram.createSocket('udp4');
        this.socket.on('message', (msg, rinfo) => this.handleMessage(msg, rinfo));
        this.socket.on('error', (e) => {
            if (e.code === 'EADDRINUSE') return;
            this._errors.push(`socket: ${e.message}`);
        });

        await new Promise(resolve => {
            try { this.socket.bind(0, resolve); } catch (e) { resolve(); }
        });

        this._log(`[bt-dht] bound udp4, bootstrapping ${BOOTSTRAP_DHT_ROUTERS.length} routers...`);
        this.bootstrap();
    }

    async stop() {
        this.running = false;
        if (this.socket) {
            try { this.socket.close(); } catch { /* already closed */ }
        }
    }

    bootstrap() {
        for (const router of BOOTSTRAP_DHT_ROUTERS) {
            this.sendFindNode(router.host, router.port, crypto.randomBytes(20));
        }
        if (this._timer) clearInterval(this._timer);
        this._timer = setInterval(() => {
            if (!this.running) return;
            for (const router of BOOTSTRAP_DHT_ROUTERS) {
                this.sendGetPeers(router.host, router.port, this.infoHash);
            }
        }, 15000);
        // 别让定时器阻止进程退出
        if (typeof this._timer.unref === 'function') this._timer.unref();
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
        this._txCount++;
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
        this._txCount++;
        this.socket.send(buffer, port, host, () => {});
    }

    setInfoHash(hash) {
        this.infoHash = hash;
    }

    // rinfo 参数可选，便于外部单测直接喂 buffer
    handleMessage(buffer, rinfo) {
        let msg;
        try {
            msg = bencode.decode(buffer);
        } catch (e) {
            this._errors.push(`decode: ${e.message}`);
            return;
        }
        this._rxCount++;

        const y = strFrom(msg.y);
        const r = msg.r;
        if (y !== 'r' || !r) return;

        // 1) 处理 nodes（find_node / 无种子时的 get_peers 都会返）
        if (r.nodes !== undefined && r.nodes !== null) {
            const nodes = decodeNodes(r.nodes);
            for (const n of nodes) this._registerPeer(n, rinfo);
        }

        // 2) 处理 nodes6（IPv6 节点）
        if (r.nodes6 !== undefined && r.nodes6 !== null) {
            const nodes6 = decodeNodes6(r.nodes6);
            for (const n of nodes6) this._registerPeer(n, rinfo);
        }

        // 3) 处理 values（get_peers 有种子时返，6B/entry：ip4 + port2）
        if (r.values !== undefined && r.values !== null) {
            const values = Array.isArray(r.values) ? r.values : [r.values];
            for (const v of values) {
                const b = toBuffer(v);
                if (b.length === 6) {
                    const ip = `${b[0]}.${b[1]}.${b[2]}.${b[3]}`;
                    const port = b.readUInt16BE(4);
                    this._registerPeer({
                        id: `bt-peer-${ip}:${port}`,
                        ip, port, family: 'ipv4'
                    }, rinfo, true);
                }
            }
        }

        // 4) 处理 error 回包（router 拒绝、节点不认识等）
        if (r.e !== undefined) {
            const errStr = Array.isArray(r.e) ? r.e.map(strFrom).join(':') : strFrom(r.e);
            this._errors.push(`dht:${rinfo ? rinfo.address : '?'}:${errStr}`);
        }
    }

    _registerPeer(entry, rinfo, isValue) {
        if (!entry || !entry.ip || !entry.port) return;
        const key = isValue
            ? `zid:dht:${entry.ip}:${entry.port}`
            : `zid:dht:${entry.id.slice(0, 12)}:${entry.ip}:${entry.port}`;

        if (this.discoveredPeers.has(key)) {
            // 更新元信息但不新建
            const existing = this.discoveredPeers.get(key);
            existing.lastSeen = Date.now();
            return;
        }

        this.discoveredPeers.set(key, {
            id: key,
            addresses: [{ host: entry.ip, port: entry.port, type: entry.family || 'ipv4' }],
            transport: 'quic',
            state: 'DISCOVERED',
            source: rinfo ? `${rinfo.address}:${rinfo.port}` : 'unknown',
            fromValue: !!isValue,
            lastSeen: Date.now()
        });
    }

    async findPeers() {
        return Array.from(this.discoveredPeers.values());
    }

    addPeer(peer) {
        if (peer && peer.id) {
            this.discoveredPeers.set(peer.id, peer);
        }
    }

    // 供外部诊断：{ rx, tx, errors, peerCount, infoHash }
    stats() {
        return {
            rx: this._rxCount,
            tx: this._txCount,
            errors: this._errors.slice(-5),
            peerCount: this.discoveredPeers.size,
            infoHash: this.infoHash.toString('hex')
        };
    }

    _log(msg) {
        if (typeof this.node === 'object' && this.node && typeof this.node.log === 'function') {
            this.node.log(msg);
        }
    }
}

module.exports = BitTorrentDHT;
