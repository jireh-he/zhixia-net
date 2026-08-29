'use strict';

/**
 * Identity — zhixia v2 节点身份
 *
 * 职责：
 *   1. 首次启动：生成 Ed25519 keyPair（通过 hyperdht 的 crypto），存 32B seed 到磁盘
 *   2. 后续启动：从磁盘加载 seed，重建 keyPair（跨重启稳定）
 *   3. 提供稳定 id：`zid:` + publicKey.hex.slice(0,16)
 *
 * 数据目录结构：
 *   <dataDir>/identity.json   { seed: "<hex>", publicKey: "<hex>", createdAt: <ms> }
 *
 * 用 JSON 而非二进制，便于人肉查看/迁移；secretKey 不需要落盘（可以从 seed 重建）。
 */
const fs = require('fs');
const path = require('path');
const { createKeyPair } = require('hyperdht/lib/crypto');

class Identity {
    constructor(opts = {}) {
        this.dataDir = opts.dataDir || './data';
        this._file = path.join(this.dataDir, 'identity.json');
        this.seed = null;
        this.publicKey = null;
        this.secretKey = null;
        this.keyPair = null;
        this.id = null;
        this.createdAt = null;
    }

    async load() {
        // 1. 尝试读文件
        if (fs.existsSync(this._file)) {
            try {
                const raw = JSON.parse(fs.readFileSync(this._file, 'utf8'));
                if (raw.seed && typeof raw.seed === 'string') {
                    this.seed = Buffer.from(raw.seed, 'hex');
                } else if (raw.seed && Buffer.isBuffer(raw.seed)) {
                    this.seed = raw.seed;
                }
                if (this.seed && this.seed.length === 32) {
                    this.keyPair = createKeyPair(this.seed);
                    this.publicKey = this.keyPair.publicKey;
                    this.secretKey = this.keyPair.secretKey;
                    this.id = `zid:${Buffer.from(this.publicKey).toString('hex').slice(0, 16)}`;
                    this.createdAt = raw.createdAt || Date.now();
                    return true;
                }
            } catch (e) {
                // 文件损坏，回退到重新生成
                console.error(`[identity] failed to load: ${e.message}, regenerating`);
            }
        }

        // 2. 生成新身份
        this.seed = Buffer.alloc(32);
        require('crypto').randomFillSync(this.seed);
        this.keyPair = createKeyPair(this.seed);
        this.publicKey = this.keyPair.publicKey;
        this.secretKey = this.keyPair.secretKey;
        this.id = `zid:${Buffer.from(this.publicKey).toString('hex').slice(0, 16)}`;
        this.createdAt = Date.now();
        return this.save();
    }

    async save() {
        try {
            fs.mkdirSync(this.dataDir, { recursive: true });
            const data = {
                seed: Buffer.from(this.seed).toString('hex'),
                publicKey: Buffer.from(this.publicKey).toString('hex'),
                createdAt: this.createdAt,
            };
            fs.writeFileSync(this._file, JSON.stringify(data, null, 2), 'utf8');
            try { fs.chmodSync(this._file, 0o600); } catch { /* ignore on non-posix */ }
            return true;
        } catch (e) {
            console.error(`[identity] failed to save: ${e.message}`);
            return false;
        }
    }

    // 便捷：返回 publicKey 十六进制字符串
    get publicKeyHex() {
        return this.publicKey ? Buffer.from(this.publicKey).toString('hex') : null;
    }
}

module.exports = Identity;
