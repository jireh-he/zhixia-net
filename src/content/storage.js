// Content: Storage — 本地内容仓库 (~/.zhixia/content/cid:xxx/)
// 每个内容保存为目录：object.json + data

const fs = require('fs/promises');
const path = require('path');

class ContentStorage {
  constructor() {
    this.home = path.join(process.env.HOME || process.env.USERPROFILE, '.zhixia/content');
  }

  async save(object, data) {
    const dir = path.join(this.home, object.id);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'object.json'), JSON.stringify(object, null, 2));
    if (data) {
      await fs.writeFile(path.join(dir, 'data'), Buffer.isBuffer(data) ? data : Buffer.from(data));
    }
    return object.id;
  }

  async load(id) {
    return JSON.parse(await fs.readFile(path.join(this.home, id, 'object.json'), 'utf8'));
  }

  async loadData(id) {
    return await fs.readFile(path.join(this.home, id, 'data'));
  }
}

module.exports = new ContentStorage();