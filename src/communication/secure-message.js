// Communication: Secure Message — 端到端加密消息封装
// 发送端：原文 → AES-GCM 加密 → 签名 → 网络只看到密文
// 接收端：验签 → AES-GCM 解密 → 原文

const msgCrypto = require('../crypto');
const cipher = require('./crypto/cipher');

class SecureMessage {
  encrypt(message, secret, privateKey) {
    const encrypted = cipher.encrypt(JSON.stringify(message), secret);
    return {
      type: 'secure.message',
      from: message.from,
      to: message.to,
      payload: encrypted,
      signature: null,
      createdAt: Date.now()
    };
  }

  sign(secureMsg, privateKey) {
    const unSig = { ...secureMsg, signature: null };
    const sig = msgCrypto.sign(unSig, privateKey);
    return { ...secureMsg, signature: sig.toString('hex') };
  }

  verify(secureMsg, publicKey) {
    const unSig = { ...secureMsg, signature: undefined };
    return msgCrypto.verify(unSig, secureMsg.signature, publicKey);
  }

  decrypt(secureMsg, secret) {
    const raw = cipher.decrypt(secureMsg.payload, secret);
    return JSON.parse(raw);
  }
}

module.exports = new SecureMessage();