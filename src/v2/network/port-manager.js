module.exports = class PortManager {
    constructor(opts) { this.startPort = opts.startPort || 9000; }
    async findAvailable() { return this.startPort; }
};