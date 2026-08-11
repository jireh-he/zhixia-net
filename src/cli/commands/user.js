const identity = require('../../identity');
const bus = require('../../core/command-bus');

bus.register('user.create', async () => {
  return await identity.manager.create();
});

bus.register('user.info', async () => {
  return await identity.manager.info();
});