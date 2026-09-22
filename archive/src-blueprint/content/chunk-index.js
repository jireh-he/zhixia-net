// Content: Chunk Index — content_id ↔ chunk metadata 的持久化索引
// 关联数据库 content_chunks 表
const { initDatabase } = require('../engine/database');

class ChunkIndex {
  constructor() {
    this.db = initDatabase();
  }

  // 记录某 CID 的所有 chunk 元数据
  set(contentId, chunks) {
    const stmt = this.db.prepare(
      'INSERT OR REPLACE INTO content_chunks (content_id, chunk_index, hash, size) VALUES (?, ?, ?, ?)'
    );
    for (const ch of chunks) {
      stmt.run(contentId, ch.index, ch.hash, ch.size);
    }
  }

  // 获取某 CID 的所有 chunk 元数据
  get(contentId) {
    return this.db.prepare(
      'SELECT * FROM content_chunks WHERE content_id = ? ORDER BY chunk_index ASC'
    ).all(contentId);
  }

  // 获取指定 chunk
  getChunk(contentId, index) {
    return this.db.prepare(
      'SELECT * FROM content_chunks WHERE content_id = ? AND chunk_index = ?'
    ).get(contentId, index);
  }

  // 获取某 CID 的 chunk 数量
  count(contentId) {
    const row = this.db.prepare(
      'SELECT COUNT(*) as n FROM content_chunks WHERE content_id = ?'
    ).get(contentId);
    return row ? row.n : 0;
  }
}

module.exports = new ChunkIndex();
