// message.send — 创建并保存加密消息（签名），实际 P2P 发送由 daemon 层处理
const registry = require('../registry');
const manager = require('../../communication/manager');

registry.register('message.send', async (args) => {
  const message = await manager.create({
    from: 'self',
    to: args.receiver,
    type: 'text',
    payload: { text: args.text }
  });
  return { success: true, id: message.id };
});
