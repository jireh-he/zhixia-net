// Content: CommandBus 命令注册
const bus = require('../core/command-bus');
const manager = require('./manager');

bus.register('content.publish', async (command) => {
  return manager.publish({ owner: command.owner, file: command.file, type: command.type, metadata: command.metadata });
});

bus.register('content.publishText', async (command) => {
  return manager.publishText({ owner: command.owner, text: command.text, title: command.title });
});

bus.register('content.info', async (command) => {
  return manager.info(command.id);
});

bus.register('content.show', async (command) => {
  return manager.show(command.id);
});

bus.register('content.list', async (command) => {
  return manager.list(command.owner);
});

bus.register('content.share', async (command) => {
  return manager.share(command.contentId, command.from, command.to);
});

bus.register('content.chain', async (command) => {
  return require('./propagation').chain(command.contentId);
});