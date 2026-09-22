// Communication: Receiver — 处理来自 P2P 的 message.send frame
// 验证签名 → 写入收件箱

const manager = require('./manager');

class MessageReceiver {
  async receive(frame, fromPubkey) {
    if (frame.type !== 'message.send') return false;
    const result = await manager.saveReceived(frame.payload);
    return result;
  }
}

module.exports = new MessageReceiver();