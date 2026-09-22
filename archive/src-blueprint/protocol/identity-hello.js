// Protocol: Identity Hello
// 节点连接成功后交换身份，网络层从此"认识谁"而非"认识哪个密钥"
// 数据结构: type + user(id/publicKey/profileHash) + node(capabilities) + timestamp + signature

const crypto = require('crypto');

class IdentityHello {
  create(identity, profileHash, capabilities = []) {
    const payload = {
      type: 'identity.hello',
      version: '0.3.1',
      user: { id: identity.id, publicKey: identity.publicKey, profileHash },
      node: { capabilities },
      timestamp: Date.now()
    };
    return payload;
  }

  sign(payload, privateKey) {
    return crypto.sign(null, Buffer.from(JSON.stringify(payload)), privateKey);
  }

  verify(payload, signature, publicKey) {
    return crypto.verify(null, Buffer.from(JSON.stringify(payload)), publicKey, Buffer.from(signature, 'hex'));
  }
}

module.exports = new IdentityHello();