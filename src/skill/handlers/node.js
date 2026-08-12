// node.* handlers
const registry = require('../registry');
const node = require('../../node/node');

registry.register('node.status', async () => node.statusInfo());
registry.register('node.start', async () => { await node.start(); return { ok: true }; });
registry.register('node.stop', async () => { await node.stop(); return { ok: true }; });
