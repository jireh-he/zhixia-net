// Communication: Message Object — 消息结构定义
const crypto = require('crypto');

class Message {
  create({ from, to, type, payload }) {
    return {
      id: 'msg:' + crypto.randomBytes(4).toString('hex'),
      from, to, type, payload,
      createdAt: Date.now()
    };
  }
}

module.exports = new Message();