// Communication: CommandBus 命令注册
// v0.3.2.1 接入 Transport：消息创建→签名→本地保存→P2P发送
const bus = require('../core/command-bus');
const manager = require('./manager');
const transport = require('./transport');

// 让 manager 在 create 时同时发送
async function sendMessage({ to, text }) {
  const msg = await manager.create({ to, text });

  // 尝试通过 transport 发向 P2P
  const sendResult = await transport.send(msg);
  if (!sendResult.ok) {
    // 发送失败 → 状态改为 pending，下次重传
    manager.savePending(msg);
  }

  return { msg, send: sendResult };
}

bus.register('message.create', sendMessage);
bus.register('message.send', sendMessage);

bus.register('message.history', async (command) => {
  return manager.history(command.from, command.limit || 50);
});

bus.register('message.inbox', async (command) => {
  return manager.inbox(command.from, command.limit || 50);
});

bus.register('message.outbox', async (command) => {
  return manager.outbox(command.from, command.limit || 50);
});

bus.register('message.verify', async (command) => {
  return manager.verify(command.msg);
});

bus.register('message.saveReceived', async (command) => {
  return manager.saveReceived(command.msg);
});

bus.register('message.withPeer', async (command) => {
  return manager.withPeer(command.from, command.peer, command.limit || 50);
});

bus.register('message.pending', async (command) => {
  return manager.pending(command.from);
});

bus.register('transport.setSender', async (command) => {
  transport.setSender(command.sender);
  return { ok: true };
});

bus.register('transport.setLookup', async (command) => {
  transport.setLookup(command.lookupFn);
  return { ok: true };
});