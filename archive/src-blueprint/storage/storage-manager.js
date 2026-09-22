// Phase 13 — Storage Manager
const chunker = require('./chunker');
const chunkStore = require('./chunk-store');
const replication = require('./replication');
const cid = require('../content/cid');

class StorageManager {
  constructor() { this.contents = new Map(); }

  store(data, opts = {}) {
    const chunks = chunker.split(data);
    const ids = chunker.hashChunks(chunks);
    chunks.forEach((c, i) => chunkStore.save(ids[i], c));
    const contentCid = cid.create(data);
    this.contents.set(contentCid, { cid: contentCid, chunkIds: ids, size: data.length, owner: opts.owner || null, createdAt: Date.now() });
    return { cid: contentCid, chunks: ids, size: data.length };
  }

  replicate(contentCid, peers) {
    const content = this.contents.get(contentCid);
    if (!content) throw new Error('Content not found: ' + contentCid);
    return replication.replicate(content, peers);
  }

  get(contentCid) {
    const content = this.contents.get(contentCid);
    if (!content) throw new Error('Content not found: ' + contentCid);
    const buffers = content.chunkIds.map(id => chunkStore.get(id));
    return buffers.filter(b => b && b.length > 0);
  }

  list() {
    const out = [];
    for (const [k, v] of this.contents) out.push({ cid: k, chunks: v.chunks.length, size: v.size, owner: v.owner });
    return out;
  }

  stats() {
    const arr = [...this.contents.values()];
    return {
      contents: arr.length,
      totalChunks: arr.reduce((s, x) => s + x.chunkIds.length, 0),
      totalSize: arr.reduce((s, x) => s + x.size, 0)
    };
  }
}

module.exports = new StorageManager();
