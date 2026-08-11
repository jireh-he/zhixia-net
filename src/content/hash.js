// Content: Hash — SHA-256 内容哈希
// 用于文件完整性验证 + CID 锚定

const crypto = require('crypto');
const fs = require('fs');

class ContentHash {
  file(filePath) {
    const hash = crypto.createHash('sha256');
    return new Promise((resolve, reject) => {
      const stream = fs.createReadStream(filePath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  text(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
  }
}

module.exports = new ContentHash();