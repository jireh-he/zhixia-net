const crypto = require('crypto');
module.exports = class Identity {
    constructor(opts) {
        this.id = 'zid:' + crypto.randomBytes(8).toString('hex');
    }
    async load() { return true; }
};