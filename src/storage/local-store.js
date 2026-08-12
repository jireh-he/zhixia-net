// 本地文件存储（JSON 持久化）
const fs = require('fs');
const path = require('path');

class LocalStore {
  constructor() {
    this.dir = path.join(process.env.ZHIXIA_DATA || process.cwd(), 'data');
    if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true });
  }

  save(name, data) {
    const file = path.join(this.dir, name + '.json');
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    return file;
  }

  load(name) {
    const file = path.join(this.dir, name + '.json');
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
}

module.exports = new LocalStore();
