// v0.6.2 Discovery Service
const router = require('./dht-router');

class DiscoveryService {
  announce(node) { router.register(node); return true; }
  lookup(id)     { return router.find(id); }
  list()         { return router.list(); }
}

module.exports = new DiscoveryService();
