'use strict';

const net = require('net');

module.exports = class PortManager {
    constructor(opts = {}) {
        this.startPort = opts.startPort || 9000;
        this.maxRetry = opts.maxRetry || 20;
    }

    /**
     * 找一个可用端口
     * startPort=0 或 null 时直接绑随机端口
     */
    async findAvailable() {
        // 用户指定 port=0 表示让系统分配
        if (!this.startPort) {
            return this._bindTest(0);
        }
        for (let i = 0; i < this.maxRetry; i++) {
            const p = this.startPort + i;
            const ok = await this._probe(p);
            if (ok) return p;
        }
        // 都失败，回退到系统分配
        return this._bindTest(0);
    }

    _probe(port) {
        return new Promise((resolve) => {
            const srv = net.createServer();
            srv.once('error', () => resolve(false));
            srv.once('listening', () => {
                srv.close(() => resolve(true));
            });
            srv.listen(port, '0.0.0.0');
        });
    }

    _bindTest(port) {
        return new Promise((resolve, reject) => {
            const srv = net.createServer();
            srv.once('error', reject);
            srv.once('listening', () => {
                const p = srv.address().port;
                srv.close(() => resolve(p));
            });
            srv.listen(port, '0.0.0.0');
        });
    }
};
