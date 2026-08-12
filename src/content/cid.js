// v0.6.3 CID — 内容身份 = Hash(content)
const crypto = require('crypto');

class CID {
  create(data) {
    if (typeof data === 'string') data = Buffer.from(data);
    return 'cid:' + crypto.createHash('sha256').update(data).digest('hex');
  }
}

module.exports = new CID();
