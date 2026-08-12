// v0.6.3 Chunker — 大文件切片
class Chunker {
  constructor(size = 1024 * 1024) { this.size = size; }
  split(buffer) {
    const chunks = [];
    for (let i = 0; i < buffer.length; i += this.size) {
      chunks.push(buffer.slice(i, i + this.size));
    }
    return chunks;
  }
}

module.exports = new Chunker();
