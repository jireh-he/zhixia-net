// v0.6.1 Key Exchange — ECDH
const crypto = require('crypto');

class KeyExchange {
  generate() {
    return crypto.generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
  }
  derive(privateKey, publicKey) {
    return crypto.diffieHellman({ privateKey, publicKey });
  }
}

module.exports = new KeyExchange();
