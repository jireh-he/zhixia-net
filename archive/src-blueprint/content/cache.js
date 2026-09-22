// Content: Cache — chunk 级分布式缓存
// ~/.zhixia/cache/<chunk_hash> — 按 chunk hash 存储，可被多个 CID 复用
const fs = require('fs/promises');
const path = require('path');

class ContentCache {
  constructor() {
    this.dir = path.join(process.env.HOME || process.env.USERPROFILE, '.zhixia/cache');
  }

  async save(hash, data) {
    const file = path.join(this.dir, hash);
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(file, data);
    return file;
  }

  async get(hash) {
    return await fs.readFile(path.join(this.dir, hash));
  }

  async exists(hash) {
    try {
      await fs.access(path.join(this.dir, hash));
      return true;
    } catch {
      return false;
    }
  }

  async list() {
    try {
      return await fs.readdir(this.dir);
    } catch {
      return [];
    }
  }
}

module.exports = new ContentCache();
