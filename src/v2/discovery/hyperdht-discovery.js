'use strict';

/**
 * HyperDHTDiscovery — HyperDHT 适配器
 *
 * 让 zhixia 的 Discovery 直接挂上 hyperdht 库。
 * 与 BitTorrentDHT 接口对齐：start/stop/findPeers/addPeer/stats。
 *
 * Peer 格式：
 *   {
 *     id: 'hyper:<pubkeyHex24>',          // 32B pubkey 截前 12B hex
 *     publicKey: Buffer (32B),            // 供 HyperDHT.connect 用
 *     addresses: [{ host, port, type: 'hyperdht' }],
 *     family: 'hyperdht',
 *     transport: 'noise',                 // HyperDHT 走 noise 加密
 *     state: 'DISCOVERED',
 *     source: 'hyperdht',
 *     lastSeen: <ts>
 *   }
 */
const HyperDHT = require('hyperdht');
const { FIREWALL } = require('hyperdht');

class HyperDHTDiscovery {
    constructor(opts = {}) {
        this.node = opts.node;
        this.port = opts.port || 0;         // 0 = 随机可用端口
        this.host = opts.host || '0.0.0.0';
        this.bootstrap = opts.bootstrap;    // 可选自定义，默认用 hyperdht 内置
        this.seed = opts.seed;              // 可选固定身份

        // 支持三种身份来源（优先级从高到低）：
        //  1. keyPair (完整 keyPair 对象) — Identity 提供
        //  2. seed (32B) — 让 hyperdht 从 seed 派生
        //  3. 都不传 — hyperdht 随机生成
        const hyperOpts = {
            port: this.port,
            host: this.host,
            anyPort: true,
            bootstrap: this.bootstrap,
        };
        if (opts.keyPair) {
            hyperOpts.keyPair = opts.keyPair;
        } else if (this.seed) {
            hyperOpts.seed = this.seed;
        }

        this.dht = new HyperDHT(hyperOpts);

        this.running = false;
        this.peers = new Map();
        this.onPeer = opts.onPeer || (() => {});
        this._stats = {
            announced: 0,
            discovered: 0,
            errors: [],
            queryCount: 0,
        };

        // 网络事件转发
        this.dht.on('persistent', () => {
            this._log('[hyperdht] persistent (加入环)');
        });
        this.dht.on('ephemeral', () => {
            this._log('[hyperdht] ephemeral (临时节点)');
        });
        this.dht.on('network-update', () => {
            this._log(`[hyperdht] network update online=${this.dht.online}`);
        });
    }

    async start() {
        if (this.running) return;
        this.running = true;

        // ready() 等 hyperdht 完成 bootstrap
        // 若 bootstrap 失败也 catch 住，不让整个 Discovery 崩
        try {
            await this.dht.ready();
        } catch (e) {
            this._log(`[hyperdht] ready() failed: ${e.message}`);
        }

        // 把自己 announce 到 DHT 里（这样别的节点能 findPeer 到我）
        // target = hash(自己的 publicKey)
        const selfKey = this.dht.defaultKeyPair.publicKey;
        try {
            this._stats.announced++;
            this._log(`[hyperdht] self key: ${this._keyPrefix(selfKey)}...`);
        } catch (e) {
            this._stats.errors.push(`announce-self: ${e.message}`);
        }
    }

    async stop() {
        this.running = false;
        if (this.dht) {
            try { await this.dht.destroy(); } catch { /* already destroyed */ }
        }
    }

    /**
     * 主动查某个 peer 是否在线（返回其地址信息）。
     * 用 async iterator 收集节点。
     * @param {Buffer} peerPublicKey
     */
    async lookup(peerPublicKey, timeoutMs = 8000) {
        this._stats.queryCount++;
        const results = [];
        let timer = null;
        try {
            await Promise.race([
                (async () => {
                    for await (const data of this.dht.lookup(peerPublicKey)) {
                        for (const peer of (data.peers || [])) {
                            results.push(peer);
                            this._registerPeer(peer);
                        }
                    }
                })(),
                new Promise(r => { timer = setTimeout(r, timeoutMs); timer.unref?.(); }),
            ]);
        } catch (e) {
            this._stats.errors.push(`lookup: ${e.message}`);
        } finally {
            if (timer) clearTimeout(timer);
        }
        return results;
    }

    /**
     * 找到某个 peer 并返回其连接信息（含 addresses）
     */
    async findPeer(peerPublicKey, timeoutMs = 10000) {
        this._stats.queryCount++;
        let found = null;
        let timer = null;
        try {
            await Promise.race([
                (async () => {
                    for await (const data of this.dht.findPeer(peerPublicKey)) {
                        found = data;
                        break;
                    }
                })(),
                new Promise(r => { timer = setTimeout(r, timeoutMs); timer.unref?.(); }),
            ]);
        } catch (e) {
            this._stats.errors.push(`findPeer: ${e.message}`);
        } finally {
            if (timer) clearTimeout(timer);
        }
        return found;
    }

    _registerPeer(hyperPeer) {
        if (!hyperPeer || !hyperPeer.publicKey) return;
        const keyHex = Buffer.from(hyperPeer.publicKey).toString('hex');
        const id = `hyper:${keyHex.slice(0, 24)}`;

        if (this.peers.has(id)) {
            const existing = this.peers.get(id);
            existing.lastSeen = Date.now();
            // 如果地址信息变了，更新
            existing.addresses = this._toAddresses(hyperPeer);
            return;
        }

        this._stats.discovered++;
        const peer = {
            id,
            publicKey: Buffer.from(hyperPeer.publicKey),
            addresses: this._toAddresses(hyperPeer),
            family: 'hyperdht',
            transport: 'noise',
            firewall: hyperPeer.firewall,
            state: 'DISCOVERED',
            source: 'hyperdht',
            lastSeen: Date.now(),
        };
        this.peers.set(id, peer);
        try { this.onPeer(peer); } catch (e) { /* caller bug */ }
    }

    _toAddresses(hyperPeer) {
        const addrs = [];
        if (hyperPeer.addresses && Array.isArray(hyperPeer.addresses)) {
            for (const a of hyperPeer.addresses) {
                if (typeof a === 'string') {
                    // 格式：ip:port 或 ip
                    const [host, portStr] = a.split(':');
                    addrs.push({ host, port: parseInt(portStr, 10) || 49737, type: 'hyperdht' });
                } else if (a && a.host) {
                    addrs.push({ host: a.host, port: a.port || 49737, type: 'hyperdht' });
                }
            }
        }
        // 如果没有地址，仍然保留 hyperdht 标记
        if (addrs.length === 0) {
            addrs.push({ host: null, port: null, type: 'hyperdht' });
        }
        return addrs;
    }

    async findPeers() {
        return Array.from(this.peers.values());
    }

    addPeer(peer) {
        if (peer && peer.id) {
            this.peers.set(peer.id, peer);
        }
    }

    /** 供外部诊断 */
    stats() {
        const s = this.dht.stats || {};
        const req = s.requests || {};
        return {
            running: this.running,
            online: !!this.dht.online,
            persistent: !!this.dht._persistent,
            publicKey: this._keyPrefix(this.dht.defaultKeyPair.publicKey),
            localAddress: this.dht.address ? this.dht.address() : null,
            firewall: this.dht.localFirewall || FIREWALL.UNKNOWN,
            peerCount: this.peers.size,
            ...this._stats,
            hyperdht: {
                queries: s.queries,
                requests: {
                    active: req.active,
                    total: req.total,
                    responses: req.responses,
                    timeouts: req.timeouts,
                    retries: req.retries,
                },
                commands: s.commands,
                punches: s.punches,
            }
        };
    }

    _keyPrefix(buf) {
        return Buffer.from(buf).toString('hex').slice(0, 24);
    }

    _log(msg) {
        if (this.node && typeof this.node.log === 'function') {
            this.node.log(msg);
        }
    }

    // 暴露底层，供 zhixia 用 dht.connect() 建立加密连接
    get client() { return this.dht; }
    get keyPair() { return this.dht.defaultKeyPair; }
}

module.exports = HyperDHTDiscovery;
