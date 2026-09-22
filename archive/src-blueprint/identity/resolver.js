// Identity: Resolver — 通过 zid 查找 identity.json
const fs = require('fs/promises');
const path = require('path');

class IdentityResolver {
  constructor() {
    this.home = path.join(process.env.HOME || process.env.USERPROFILE, '.zhixia/users');
  }

  async resolve(id) {
    const file = path.join(this.home, id, 'identity.json');
    try {
      return JSON.parse(await fs.readFile(file, 'utf8'));
    } catch (e) {
      return null;
    }
  }
}

module.exports = new IdentityResolver();