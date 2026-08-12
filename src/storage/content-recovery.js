// Phase 13 — 内容恢复
class ContentRecovery {
  constructor() { this.sources = new Map(); }

  addSource(cid, peers) { this.sources.set(cid, peers); }

  getSource(cid) { return this.sources.get(cid) || []; }

  merge(chunks) {
    if (!Array.isArray(chunks)) chunks = [chunks];
    return Buffer.concat(chunks);
  }

  recover(cid, chunkStore) {
    const chunkIds = (chunkStore || {}).list ? chunkStore.list().filter(id => id.startsWith(cid + ':')) : [];
    const buffers = chunkIds.map(id => chunkStore.get(id));
    const valid = buffers.filter(b => b && b.length > 0);
    return valid.length > 0 ? this.merge(valid) : null;
  }
}

module.exports = new ContentRecovery();
