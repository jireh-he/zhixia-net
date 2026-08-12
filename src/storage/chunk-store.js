// Phase 13 — Chunk 存储
const local = require('./local-store');

class ChunkStore {
  constructor() { this.index = new Map(); }

  save(id, data) {
    local.save('chunk:' + id, data);
    this.index.set(id, { saved: Date.now(), size: data.length });
    return true;
  }

  get(id) { return local.load('chunk:' + id); }
  exists(id) { return this.index.has(id); }
  list() { return [...this.index.keys()]; }
  stats() {
    const arr = [...this.index.values()];
    return { chunks: arr.length, totalSize: arr.reduce((s, x) => s + x.size, 0) };
  }
}

module.exports = new ChunkStore();
