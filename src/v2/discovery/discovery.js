'use strict';

const HyperDHTDiscovery = require('./hyperdht-discovery');

/**
 * Discovery — zhixia v2 发现层入口
 *
 * 目前挂的是 HyperDHT 适配器（hyperdht 库）。
 * 保留 BitTorrentDHT 作为可选备选（未来做双栈并存时切换）。
 *
 * 接口：start / stop / findPeers / lookup / findPeer / stats
 */
module.exports = class Discovery {
    constructor(opts = {}) {
        this.node = opts.node;
        this.backend = opts.backend || 'hyperdht';

        if (this.backend === 'hyperdht') {
            // 优先用 zhixia Identity 的 keyPair（跨重启稳定身份）
            // 其次用外部传的 seed
            // 最后让 hyperdht 随机生成
            const identity = this.node && this.node.identity;
            const keyPair = opts.keyPair
                || (identity && identity.keyPair);
            const seed = opts.seed
                || (identity && identity.seed);

            this._impl = new HyperDHTDiscovery({
                node: this.node,
                port: opts.port || 0,
                host: opts.host,
                bootstrap: opts.bootstrap,
                seed: seed,
                keyPair: keyPair,
                onPeer: (peer) => this._onPeer(peer),
            });
        } else {
            throw new Error(`Unknown discovery backend: ${this.backend}`);
        }
    }

    async start() {
        await this._impl.start();
    }

    async stop() {
        await this._impl.stop();
    }

    async findPeers() {
        return this._impl.findPeers();
    }

    /** 查某 peer 的 announce */
    async lookup(peerPublicKey, timeoutMs) {
        return this._impl.lookup(peerPublicKey, timeoutMs);
    }

    /** 找具体 peer */
    async findPeer(peerPublicKey, timeoutMs) {
        return this._impl.findPeer(peerPublicKey, timeoutMs);
    }

    addPeer(peer) {
        this._impl.addPeer(peer);
    }

    stats() {
        return this._impl.stats();
    }

    // 暴露底层 hyperdht client 供连接层用
    get client() { return this._impl.client; }
    get keyPair() { return this._impl.keyPair; }

    _onPeer(peer) {
        // 转发给 PeerManager，让 connection 层可以直连
        if (this.node && this.node.peers && typeof this.node.peers.add === 'function') {
            try { this.node.peers.add(peer); } catch (e) { /* peer manager 可能拒收 */ }
        }
    }
};
