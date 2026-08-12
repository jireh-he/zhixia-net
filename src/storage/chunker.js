// Phase 13 — 文件切片
const crypto = require('crypto');

class Chunker {
  constructor(size = 1024 * 1024) { this.size = size; }

  split(data) {
    if (typeof data === 'string') data = Buffer.from(data);
    const chunks = [];
    for (let i = 0; i < data.length; i += this.size) {
      chunks.push(data.slice(i, i + this.size));
    }
    return chunks;
  }

  hash(chunk) {
    return 'chunk:' + crypto.createHash('sha256').update(chunk).digest('hex');
  }

  hashChunks(chunks) { return chunks.map(c => this.hash(c)); }
}

module.exports = new Chunker();
