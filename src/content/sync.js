// Content: Sync — 内容同步（从网络下载 CID）
// 流程: 发现 provider → 请求 chunks → 验证 hash → 组装
const provider = require('./provider');
const transfer = require('./transfer');
const chunkIndex = require('./chunk-index');
const cache = require('./cache');
const storage = require('./storage');
const obj = require('./object');
const crypto = require('crypto');

class ContentSync {
  constructor() {
    this.transport = null;
  }

  setTransport(t) { this.transport = t; transfer.setTransport(t); }

  // 同步完整内容：从网络拉取并组装
  async sync(contentId) {
    // 1. 发现 provider
    const providers = provider.list(contentId);
    if (providers.length === 0) {
      throw new Error(`No provider found for ${contentId}`);
    }

    const firstProvider = providers[0].provider_id;
    console.log(`[content:sync] Provider found: ${firstProvider} for ${contentId}`);

    // 2. 请求 chunk 索引（通过 content.request index=-1）
    const indexResult = await transfer.request(contentId, -1, firstProvider);
    const chunks = indexResult.chunks || indexResult;

    // 3. 逐块下载 + 验证
    const buffers = [];
    for (const ch of chunks) {
      if (await cache.exists(ch.hash)) {
        console.log(`[content:sync] Chunk ${ch.index} cached, skipping download`);
        buffers.push(await cache.get(ch.hash));
        continue;
      }
      const resp = await transfer.request(contentId, ch.index, firstProvider);
      const result = await transfer.receive({
        contentId, index: ch.index, hash: ch.hash, data: resp.data
      });
      console.log(`[content:sync] Chunk ${result.index} verified ✓`);
      buffers.push(await cache.get(ch.hash));
    }

    // 4. 组装完整数据
    const fullData = Buffer.concat(buffers);
    const contentHash = crypto.createHash('sha256').update(fullData).digest('hex');

    // 5. 保存 object
    const localObj = await storage.load(contentId).catch(() => null);
    if (!localObj) {
      const newObject = obj.create({
        owner: firstProvider, type: 'file', hash: contentHash,
        metadata: { title: 'synced', hash: contentHash, syncedFrom: firstProvider }
      });
      newObject.id = contentId;
      await storage.save(newObject, fullData);
    } else {
      // 已有 object，更新 data
      await storage.save(localObj, fullData);
    }

    // 6. 注册自己为 provider
    provider.announce(contentId, 'self');

    return { ok: true, contentId, chunks: chunks.length, hash: contentHash };
  }
}

module.exports = new ContentSync();
