module.exports = class Config {
    constructor(opts) {
        this.name = opts.name || 'node-1';
        this.port = opts.port || 9001;
        this.dataDir = opts.dataDir || './data';
        this.transport = { tor: opts.tor || false };
    }
};