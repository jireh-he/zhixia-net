// Trust: Evidence — 事实记录
// 任何评价必须有可追溯的事实依据
const crypto = require('crypto');

class Evidence {
  create({ type, target, object }) {
    return {
      id: 'ev:' + crypto.randomBytes(8).toString('hex'),
      type, target, object,
      createdAt: Date.now()
    };
  }
}

module.exports = new Evidence();
