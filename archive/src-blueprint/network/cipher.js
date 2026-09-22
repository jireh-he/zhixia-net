// v0.6.1 Cipher — AES-256-GCM
const crypto = require('crypto');

class Cipher {
  encrypt(data, key) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key.slice(0, 32), iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final()]);
    return { iv, data: encrypted, tag: cipher.getAuthTag() };
  }
  decrypt(packet, key) {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key.slice(0, 32), packet.iv);
    decipher.setAuthTag(packet.tag);
    const result = Buffer.concat([decipher.update(packet.data), decipher.final()]);
    return JSON.parse(result.toString());
  }
}

module.exports = new Cipher();
