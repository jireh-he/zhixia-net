// 本地文件存储（JSON 持久化，支持 Buffer）
const fs = require('fs');
const path = require('path');

class LocalStore {
  constructor() {
    this.dir = path.join(process.env.ZHIXIA_DATA || process.cwd(), 'data');
    if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true });
  }

  save(name, data) {
    const file = path.join(this.dir, name + '.json');
    let content;
    if (Buffer.isBuffer(data)) {
      content = JSON.stringify({ __buffer: data.toString('base64') });
    } else {
      content = JSON.stringify(data);
    }
    fs.writeFileSync(file, content);
    return file;
  }

  load(name) {
    const file = path.join(this.dir, name + '.json');
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, 'utf8');
    const obj = JSON.parse(raw);
    if (obj && obj.__buffer !== undefined) return Buffer.from(obj.__buffer, 'base64');
    return obj;
  }
}

module.exports = new LocalStore();
