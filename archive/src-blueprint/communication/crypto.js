// Communication: Message Crypto — ed25519 签名/验证
// 使用 crypto.sign(null, ...) 原生方式（ed25519 不支持 SHA256 参数）

const crypto = require('crypto');

class MessageCrypto {
  sign(data, privateKey) {
    return crypto.sign(null, Buffer.from(JSON.stringify(data)), privateKey);
  }

  verify(data, signature, publicKey) {
    const sig = Buffer.isBuffer(signature) ? signature : Buffer.from(signature, 'hex');
    return crypto.verify(null, Buffer.from(JSON.stringify(data)), publicKey, sig);
  }
}

module.exports = new MessageCrypto();