// v0.6.3 Manifest — 描述文件与 chunk 列表
class Manifest {
  create(content) {
    return {
      cid: content.cid,
      chunks: content.chunks || [],
      size: content.size,
      owner: content.owner,
      type: content.type,
      createdAt: Date.now()
    };
  }
}

module.exports = new Manifest();
