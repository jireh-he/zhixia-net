// Content: Object — 公开内容对象
// 类似 Git commit + IPFS CID，唯一标识一份内容

const crypto = require('crypto');

class ContentObject {
  create({ owner, type, hash, metadata }) {
    return {
      id: 'cid:' + crypto.randomBytes(8).toString('hex'),
      owner, type, hash,
      metadata: metadata || {},
      createdAt: Date.now()
    };
  }
}

module.exports = new ContentObject();