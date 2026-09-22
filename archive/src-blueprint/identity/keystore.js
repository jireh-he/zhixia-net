// Identity: Keystore — ed25519 密钥生成与存储
// 第一版：生成 + 保存 + 加载（明文保存，v0.3.2 加加密）

const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

class KeyStore {
  constructor() {
    this.defaultHome = path.join(process.env.HOME || process.env.USERPROFILE, '.zhixia', 'users');
  }

  // 生成 ed25519 密钥对，保存到指定目录
  async create(dir) {
    await fs.mkdir(dir, { recursive: true });

    const pair = crypto.generateKeyPairSync('ed25519');

    const privateKey = pair.privateKey.export({ type: 'pkcs8', format: 'pem' });
    const publicKey = pair.publicKey.export({ type: 'spki', format: 'pem' });

    await fs.writeFile(path.join(dir, 'private.key'), privateKey, { mode: 0o600 });
    await fs.writeFile(path.join(dir, 'public.key'), publicKey, { mode: 0o644 });

    return { publicKey, privateKey };
  }

  // 从目录加载密钥对
  async load(dir) {
    const publicKey = await fs.readFile(path.join(dir, 'public.key'), 'utf8');
    const privateKey = await fs.readFile(path.join(dir, 'private.key'), 'utf8');
    return { publicKey, privateKey };
  }

  // 生成 zid：SHA256(publicKey) 前 8 字节
  static zidFromPublicKey(pubkey) {
    return 'zid:' + crypto.createHash('sha256').update(pubkey).digest('hex').substring(0, 8);
  }
}

module.exports = new KeyStore();