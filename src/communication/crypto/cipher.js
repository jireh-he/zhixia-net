// Communication: Cipher — AES-256-GCM 加密/解密
// 使用 SHA-256 派生密钥，12 字节随机 IV，GCM 提供完整性保护

const crypto = require('crypto');

class Cipher {
  encrypt(text, secret) {
    const key = crypto.createHash('sha256').update(secret).digest();
    const iv = crypto.randomBytes(12);

    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(text, 'utf8'),
      cipher.final()
    ]);

    return {
      data: encrypted.toString('hex'),
      iv: iv.toString('hex'),
      tag: cipher.getAuthTag().toString('hex')
    };
  }

  decrypt(payload, secret) {
    const key = crypto.createHash('sha256').update(secret).digest();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(payload.tag, 'hex'));

    return Buffer.concat([
      decipher.update(Buffer.from(payload.data, 'hex')),
      decipher.final()
    ]).toString('utf8');
  }
}

module.exports = new Cipher();