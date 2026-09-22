require('./handlers/message');
require('./handlers/identity');
require('./handlers/content');
require('./handlers/trust');
require('./handlers/agent');
require('./handlers/resource');
require('./handlers/node');

const registry = require('./registry');
const router = require('./router');

module.exports = {
  list: () => registry.list(),
  execute: (req) => router.execute(req)
};
