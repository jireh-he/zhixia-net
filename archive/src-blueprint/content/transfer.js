// Content: Transfer — 内容传输（chunk 级别请求/接收/校验）
const crypto = require('crypto');
const chunk = require('./chunk');
const cache = require('./cache');

class ContentTransfer {
  constructor() {
    this.transport = null;
  }

  setTransport(t) { this.transport = t; }

  // 向 provider 请求指定 CID 的 chunk
  async request(contentId, index, providerId) {
    if (!this.transport) throw new Error('No transport set');
    return await this.transport.send({
      type: 'content.request',
      contentId,
      index,
      to: providerId
    });
  }

  // 接收 chunk，验证 hash 后才保存
  async receive({ contentId, index, hash, data }) {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const computed = crypto.createHash('sha256').update(buf).digest('hex');
    if (computed !== hash) {
      throw new Error(`Chunk hash mismatch: expected ${hash}, got ${computed}`);
    }
    await cache.save(hash, buf);
    return { verified: true, contentId, index, hash };
  }

  // 响应内容请求：从本地提供 chunk
  async serve(contentId, index) {
    const chunks = require('./chunk-index').get(contentId);
    if (!chunks || !chunks[index]) throw new Error(`Chunk ${index} not found for ${contentId}`);
    const ch = chunks[index];
    const data = await cache.get(ch.hash);
    return { type: 'content.chunk', contentId, index: ch.index, hash: ch.hash, data };
  }
}

module.exports = new ContentTransfer();
