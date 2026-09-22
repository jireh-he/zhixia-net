// Identity Manager — 统一管理身份创建、查询
// 组合 KeyStore + zid + identity.json 写入

const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const keystore = require('./keystore');

class IdentityManager {
  constructor() {
    this.home = path.join(process.env.HOME || process.env.USERPROFILE, '.zhixia', 'users');
  }

  async create() {
    const id = 'zid:' + crypto.randomBytes(4).toString('hex');
    const dir = path.join(this.home, id);
    const { publicKey } = await keystore.create(dir);

    const info = { id, publicKey, createdAt: Date.now() };
    await fs.writeFile(path.join(dir, 'identity.json'), JSON.stringify(info, null, 2));

    return info;
  }

  async info() {
    const users = await fs.readdir(this.home);
    if (users.length === 0) {
      throw new Error('No identity found');
    }

    const id = users[0];
    const file = path.join(this.home, id, 'identity.json');
    return JSON.parse(await fs.readFile(file, 'utf8'));
  }
}

module.exports = new IdentityManager();