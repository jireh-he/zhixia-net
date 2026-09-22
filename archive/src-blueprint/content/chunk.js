// Content: Chunk — 文件分片（类 BitTorrent chunk）
const crypto = require('crypto');
const fs = require('fs/promises');

class ChunkManager {
  constructor(chunkSize) {
    this.size = chunkSize || 1024 * 1024; // 默认 1MB
  }

  async split(file) {
    const data = await fs.readFile(file);
    const chunks = [];
    for (let i = 0; i < data.length; i += this.size) {
      const part = data.slice(i, i + this.size);
      chunks.push({
        index: chunks.length,
        hash: crypto.createHash('sha256').update(part).digest('hex'),
        size: part.length,
        data: part
      });
    }
    return chunks;
  }

  // 从内存 Buffer 分片（用于 publishText）
  splitBuffer(buffer) {
    const chunks = [];
    for (let i = 0; i < buffer.length; i += this.size) {
      const part = buffer.slice(i, i + this.size);
      chunks.push({
        index: chunks.length,
        hash: crypto.createHash('sha256').update(part).digest('hex'),
        size: part.length,
        data: part
      });
    }
    return chunks;
  }

  // 验证 chunk hash
  verify(chunk) {
    const computed = crypto.createHash('sha256').update(chunk.data).digest('hex');
    return computed === chunk.hash;
  }
}

module.exports = new ChunkManager();
