// Content: Manager — 发布/查询/传播 管理
const path = require('path');
const hash = require('./hash');
const obj = require('./object');
const storage = require('./storage');
const propagation = require('./propagation');
const fs = require('fs/promises');

class ContentManager {
  async publish({ owner, file, type, metadata }) {
    const contentHash = await hash.file(file);
    const objMeta = { ...(metadata || {}), filename: path.basename(file), hash: contentHash };
    const object = obj.create({ owner, type: type || this._detectType(file), hash: contentHash, metadata: objMeta });
    const data = await fs.readFile(file);
    const cid = await storage.save(object, data);

    // 记录发布传播
    propagation.record({ contentId: cid, from: owner, to: null, action: 'publish' });

    return { cid, object };
  }

  async publishText({ owner, text, title }) {
    const contentHash = hash.text(text);
    const object = obj.create({
      owner, type: 'text',
      hash: contentHash,
      metadata: { title: title || 'untitled', hash: contentHash }
    });
    const cid = await storage.save(object, text);
    propagation.record({ contentId: cid, from: owner, to: null, action: 'publish' });
    return { cid, object };
  }

  async info(id) {
    const object = await storage.load(id);
    return object;
  }

  async show(id) {
    const object = await storage.load(id);
    const data = await storage.loadData(id);
    return { object, data: data.toString('utf8') };
  }

  async list(owner) {
    // 从 storage 目录读取
    const files = await fs.readdir(storage.home).catch(() => []);
    const result = [];
    for (const f of files) {
      const o = await storage.load(f).catch(() => null);
      if (o && (!owner || o.owner === owner)) {
        result.push(o);
      }
    }
    return result.sort((a, b) => b.createdAt - a.createdAt);
  }

  share(contentId, from, to) {
    propagation.record({ contentId, from, to, action: 'share' });
    return { ok: true, contentId, from, to };
  }

  _detectType(file) {
    const ext = path.extname(file).toLowerCase();
    const map = { '.md': 'document', '.txt': 'text', '.jpg': 'image', '.png': 'image', '.pdf': 'document', '.mp4': 'video', '.mp3': 'audio' };
    return map[ext] || 'file';
  }
}

module.exports = new ContentManager();