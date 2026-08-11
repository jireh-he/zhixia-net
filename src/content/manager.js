// Content: Manager — 发布/查询/传播/分片 管理
const path = require('path');
const hash = require('./hash');
const obj = require('./object');
const storage = require('./storage');
const propagation = require('./propagation');
const chunk = require('./chunk');
const chunkIndex = require('./chunk-index');
const cache = require('./cache');
const provider = require('./provider');
const fs = require('fs/promises');

class ContentManager {
  async publish({ owner, file, type, metadata }) {
    const contentHash = await hash.file(file);
    const data = await fs.readFile(file);
    const objMeta = { ...(metadata || {}), filename: path.basename(file), hash: contentHash };
    const object = obj.create({ owner, type: type || this._detectType(file), hash: contentHash, metadata: objMeta });

    // 分片并缓存
    const chunks = chunk.splitBuffer(data);
    for (const ch of chunks) {
      await cache.save(ch.hash, ch.data);
    }
    chunkIndex.set(object.id, chunks);

    const cid = await storage.save(object, data);

    // 记录传播 + 注册 provider
    propagation.record({ contentId: cid, from: owner, to: null, action: 'publish' });
    provider.announce(cid, owner);

    return { cid, object, chunks: chunks.length };
  }

  async publishText({ owner, text, title }) {
    const contentHash = hash.text(text);
    const data = Buffer.from(text);
    const object = obj.create({
      owner, type: 'text',
      hash: contentHash,
      metadata: { title: title || 'untitled', hash: contentHash }
    });

    const chunks = chunk.splitBuffer(data);
    for (const ch of chunks) {
      await cache.save(ch.hash, ch.data);
    }
    chunkIndex.set(object.id, chunks);

    const cid = await storage.save(object, data);
    propagation.record({ contentId: cid, from: owner, to: null, action: 'publish' });
    provider.announce(cid, owner);
    return { cid, object, chunks: chunks.length };
  }

  async info(id) {
    const object = await storage.load(id);
    const chunks = chunkIndex.get(id);
    return { object, chunkCount: chunks.length };
  }

  async show(id) {
    const object = await storage.load(id);
    const data = await storage.loadData(id);
    return { object, data: data.toString('utf8') };
  }

  async list(owner) {
    const files = await fs.readdir(storage.home).catch(() => []);
    const result = [];
    for (const f of files) {
      const o = await storage.load(f).catch(() => null);
      if (o && (!owner || o.owner === owner)) {
        result.push({ ...o, chunkCount: chunkIndex.count(f) });
      }
    }
    return result.sort((a, b) => b.createdAt - a.createdAt);
  }

  share(contentId, from, to) {
    propagation.record({ contentId, from, to, action: 'share' });
    return { ok: true, contentId, from, to };
  }

  async chunks(contentId) {
    return chunkIndex.get(contentId);
  }

  _detectType(file) {
    const ext = path.extname(file).toLowerCase();
    const map = { '.md': 'document', '.txt': 'text', '.jpg': 'image', '.png': 'image', '.pdf': 'document', '.mp4': 'video', '.mp3': 'audio' };
    return map[ext] || 'file';
  }
}

module.exports = new ContentManager();
