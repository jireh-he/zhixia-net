// Communication: Key Exchange — X25519 密钥交换
// 用于端到端加密：双方各自用对方公钥 + 自己私钥计算出相同 secret

const crypto = require('crypto');

class KeyExchange {
  generate() {
    return crypto.generateKeyPairSync('x25519');
  }

  derive(privateKey, peerPublicKey) {
    return crypto.diffieHellman({ privateKey, publicKey: peerPublicKey });
  }
}

module.exports = new KeyExchange();