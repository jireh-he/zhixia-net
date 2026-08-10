// Layer 2: Reputation Engine
// 局部声誉图，非全局，按 Topic 隔离

class ReputationEngine {
  constructor(db) {
    this.db = db;
    this.cache = new Map(); // 内存缓存，LRU 淘汰
    this.maxCacheSize = 1000;
  }

  _cacheKey(pubkey, topic) {
    return `${pubkey}:${topic}`;
  }

  _getFromCache(pubkey, topic) {
    return this.cache.get(this._cacheKey(pubkey, topic));
  }

  _setCache(pubkey, topic, data) {
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(this._cacheKey(pubkey, topic), data);
  }

  getReputation(peerPubkey, topic) {
    const cached = this._getFromCache(peerPubkey, topic);
    if (cached) return cached;

    const row = this.db.prepare(
      'SELECT * FROM reputation WHERE peer_pubkey = ? AND topic = ?'
    ).get(peerPubkey, topic);

    const defaultRep = {
      peer_pubkey: peerPubkey,
      topic: topic,
      technical_accuracy: 0.5,
      information_freshness: 0.5,
      collaboration: 0.5,
      civility: 0.5,
      last_interaction: null,
      introduced_by: null
    };

    const result = row || defaultRep;
    this._setCache(peerPubkey, topic, result);
    return result;
  }

  updateReputation(peerPubkey, topic, deltas) {
    const current = this.getReputation(peerPubkey, topic);

    // 平滑更新，避免单次交互剧烈波动
    const alpha = 0.1; // 学习率
    const newRep = { ...current };

    for (const [dim, value] of Object.entries(deltas)) {
      if (dim in newRep && typeof value === 'number') {
        newRep[dim] = current[dim] * (1 - alpha) + value * alpha;
        newRep[dim] = Math.max(0, Math.min(1, newRep[dim])); // 裁剪到 [0,1]
      }
    }

    newRep.last_interaction = Date.now();

    this.db.prepare(`
      INSERT INTO reputation (peer_pubkey, topic, technical_accuracy, information_freshness, collaboration, civility, last_interaction, introduced_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(peer_pubkey, topic) DO UPDATE SET
        technical_accuracy = excluded.technical_accuracy,
        information_freshness = excluded.information_freshness,
        collaboration = excluded.collaboration,
        civility = excluded.civility,
        last_interaction = excluded.last_interaction
    `).run(
      newRep.peer_pubkey,
      newRep.topic,
      newRep.technical_accuracy,
      newRep.information_freshness,
      newRep.collaboration,
      newRep.civility,
      newRep.last_interaction,
      newRep.introduced_by
    );

    this._setCache(peerPubkey, topic, newRep);
    return newRep;
  }

  // 每日衰减任务
  decayInactive(thresholdDays = 30) {
    const threshold = Date.now() - thresholdDays * 24 * 60 * 60 * 1000;
    const decayRate = 0.01; // 每天衰减 1%

    this.db.prepare(`
      UPDATE reputation SET
        technical_accuracy = MAX(0.1, technical_accuracy - ?),
        information_freshness = MAX(0.1, information_freshness - ?),
        collaboration = MAX(0.1, collaboration - ?),
        civility = MAX(0.1, civility - ?)
      WHERE last_interaction < ?
    `).run(decayRate, decayRate, decayRate, decayRate, threshold);

    // 清空缓存，强制重新加载
    this.cache.clear();
  }

  // 计算投票权重
  computeVoteWeight(peerPubkey, topic) {
    const rep = this.getReputation(peerPubkey, topic);
    return (
      rep.technical_accuracy * 0.4 +
      rep.collaboration * 0.3 +
      (rep.last_interaction ? 0.2 : 0) + // 活跃度
      0.1 // 基础分
    );
  }

  // 黑名单检查
  isBlacklisted(peerPubkey) {
    const row = this.db.prepare(
      'SELECT civility FROM reputation WHERE peer_pubkey = ? ORDER BY civility ASC LIMIT 1'
    ).get(peerPubkey);
    return row && row.civility < 0.1;
  }
}

module.exports = { ReputationEngine };
