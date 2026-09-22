// content.publish — 发布公开内容
const registry = require('../registry');
const manager = require('../../content/manager');

registry.register('content.publish', async (args) => {
  return manager.publish({
    owner: 'self',
    file: args.path,
    type: 'document'
  });
});
