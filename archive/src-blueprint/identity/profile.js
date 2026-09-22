// Identity: Profile Manager — 用户资料管理
// 资料可变，不改 zid。文件存储在 ~/.zhixia/users/zid:xxxx/profile.json

const fs = require('fs/promises');
const path = require('path');

class ProfileManager {
  async load(identityDir) {
    const file = path.join(identityDir, 'profile.json');
    try {
      return JSON.parse(await fs.readFile(file, 'utf8'));
    } catch (e) {
      return { updatedAt: null };
    }
  }

  async update(identityDir, data) {
    const file = path.join(identityDir, 'profile.json');
    let profile = {};
    try {
      profile = JSON.parse(await fs.readFile(file, 'utf8'));
    } catch (e) { /* 不存在则新建 */ }

    const updated = { ...profile, ...data, updatedAt: Date.now() };

    await fs.writeFile(file, JSON.stringify(updated, null, 2));
    return updated;
  }
}

module.exports = new ProfileManager();