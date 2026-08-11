// Layer 2: Propagation Engine
// 核心设计：信息传播链越长，原始信息源获得的声誉奖励越多
// 每个传播节点签名验证，防止伪造传播链

const crypto = require('hypercore-crypto');

const PROPAGATION_CONFIG = {
  maxChainLength: 16,           // 最大传播深度，防无限链
  originRewardBase: 0.08,       // 源节点基础奖励
  originRewardMultiplier: 0.03, // 每多一跳的额外奖励
  relayReward: 0.02,            // 中间传播者奖励
  maxRewardPerMsg: 0.25,        // 单条消息最大奖励上限
  dedupWindowMs: 7 * 24 * 60 * 60 * 1000  // 7 天内同一消息不重复奖励
};

class PropagationEngine {
  constructor(db, keyPair) {
    this.db = db;
    this.keyPair = keyPair;
    this._initTable();
  }

  _initTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS propagation_rewards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        origin_pubkey TEXT NOT NULL,
        origin_msg_id TEXT NOT NULL,
        topic TEXT NOT NULL,
        hop_count INTEGER,
        rewarded_at INTEGER,
        reward_type TEXT,  -- 'origin' | 'relay'
        beneficiary_pubkey TEXT,
        reward_amount REAL,
        UNIQUE(origin_pubkey, origin_msg_id, beneficiary_pubkey, reward_type)
      );
      CREATE INDEX IF NOT EXISTS idx_prop_origin ON propagation_rewards(origin_pubkey, origin_msg_id);
      CREATE INDEX IF NOT EXISTS idx_prop_beneficiary ON propagation_rewards(beneficiary_pubkey);
    `);
  }

  // ========== 构建传播消息 ==========
  // 当我转发一条消息时，在传播链上追加自己的签名
  relayMessage(originalMsg, myPubkey) {
    const now = Date.now();
    const propagation = originalMsg.propagation || {
      origin_pubkey: myPubkey,
      origin_msg_id: this._msgId(originalMsg),
      chain: [],
      hop_count: 0,
      sig_chain: []
    };

    // 检查是否已达最大深度
    if (propagation.hop_count >= PROPAGATION_CONFIG.maxChainLength) {
      return { ok: false, error: 'Max propagation depth reached' };
    }

    // 防环：检查自己不在链中
    if (propagation.chain.includes(myPubkey)) {
      return { ok: false, error: 'Loop detected in propagation chain' };
    }

    // 对当前传播状态签名
    const sigPayload = Buffer.from(JSON.stringify({
      origin: propagation.origin_pubkey,
      origin_msg: propagation.origin_msg_id,
      prev_hop: propagation.chain[propagation.chain.length - 1] || propagation.origin_pubkey,
      next_hop: myPubkey,
      hop_count: propagation.hop_count + 1,
      ts: now
    }));
    const signature = crypto.sign(sigPayload, this.keyPair.secretKey).toString('hex');

    const newPropagation = {
      origin_pubkey: propagation.origin_pubkey,
      origin_msg_id: propagation.origin_msg_id,
      chain: [...propagation.chain, myPubkey],
      hop_count: propagation.hop_count + 1,
      sig_chain: [...propagation.sig_chain, signature]
    };

    return {
      ok: true,
      msg: {
        ...originalMsg,
        propagation: newPropagation,
        ts: now
      }
    };
  }

  // ========== 验证传播链完整性 ==========
  verifyChain(msg, expectedTopic) {
    const prop = msg.propagation;
    if (!prop) {
      // 无传播链 = 原始消息，合法
      return { ok: true, isOrigin: true, hop_count: 0 };
    }

    // 1. 基础校验
    if (!prop.origin_pubkey || !prop.origin_msg_id) {
      return { ok: false, error: 'Missing propagation metadata' };
    }
    if (prop.hop_count !== prop.chain.length || prop.hop_count !== prop.sig_chain.length) {
      return { ok: false, error: 'Chain length mismatch' };
    }
    if (prop.hop_count > PROPAGATION_CONFIG.maxChainLength) {
      return { ok: false, error: 'Chain too long' };
    }

    // 2. 逐跳验证签名
    let prevPubkey = prop.origin_pubkey;
    for (let i = 0; i < prop.chain.length; i++) {
      const hopPubkey = prop.chain[i];
      const signature = Buffer.from(prop.sig_chain[i], 'hex');

      const sigPayload = Buffer.from(JSON.stringify({
        origin: prop.origin_pubkey,
        origin_msg: prop.origin_msg_id,
        prev_hop: prevPubkey,
        next_hop: hopPubkey,
        hop_count: i + 1,
        ts: msg.ts  // 使用消息时间戳（简化）
      }));

      const hopPubkeyBuf = Buffer.from(hopPubkey, 'hex');
      const valid = crypto.verify(sigPayload, signature, hopPubkeyBuf);
      if (!valid) {
        return { ok: false, error: `Invalid signature at hop ${i + 1}` };
      }
      prevPubkey = hopPubkey;
    }

    // 3. 防环检查
    const allNodes = [prop.origin_pubkey, ...prop.chain];
    const uniqueNodes = new Set(allNodes);
    if (uniqueNodes.size !== allNodes.length) {
      return { ok: false, error: 'Loop detected' };
    }

    return {
      ok: true,
      isOrigin: false,
      hop_count: prop.hop_count,
      origin_pubkey: prop.origin_pubkey,
      origin_msg_id: prop.origin_msg_id
    };
  }

  // ========== 计算并发放传播奖励 ==========
  // 返回 { rewards: [{beneficiary, type, amount}] }
  computeRewards(msg, topic) {
    const verify = this.verifyChain(msg, topic);
    if (!verify.ok) {
      return { ok: false, error: verify.error, rewards: [] };
    }

    const rewards = [];
    const now = Date.now();

    if (verify.isOrigin) {
      // 原始消息：无传播奖励（等待被传播）
      return { ok: true, rewards: [] };
    }

    const { origin_pubkey, origin_msg_id, hop_count } = verify;

    // 1. 源节点奖励（传播链越长，奖励越多）
    const originReward = Math.min(
      PROPAGATION_CONFIG.maxRewardPerMsg,
      PROPAGATION_CONFIG.originRewardBase + PROPAGATION_CONFIG.originRewardMultiplier * Math.log2(hop_count + 1)
    );

    if (!this._isRewarded(origin_pubkey, origin_msg_id, origin_pubkey, 'origin')) {
      rewards.push({
        beneficiary: origin_pubkey,
        type: 'origin',
        amount: originReward,
        reason: `Message propagated ${hop_count} hops`
      });
    }

    // 2. 中间传播者奖励（每人一份固定奖励）
    const chain = msg.propagation.chain;
    for (let i = 0; i < chain.length; i++) {
      const relay = chain[i];
      if (!this._isRewarded(origin_pubkey, origin_msg_id, relay, 'relay')) {
        rewards.push({
          beneficiary: relay,
          type: 'relay',
          amount: PROPAGATION_CONFIG.relayReward,
          reason: `Relayed at hop ${i + 1}`
        });
      }
    }

    return { ok: true, rewards, hop_count };
  }

  // ========== 记录奖励（持久化 + 去重） ==========
  recordRewards(origin_pubkey, origin_msg_id, topic, rewards) {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO propagation_rewards
      (origin_pubkey, origin_msg_id, topic, hop_count, rewarded_at, reward_type, beneficiary_pubkey, reward_amount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const r of rewards) {
      stmt.run(
        origin_pubkey,
        origin_msg_id,
        topic,
        rewards.find(x => x.type === 'origin') ? rewards.find(x => x.type === 'origin').hop_count || 0 : 0,
        now,
        r.type,
        r.beneficiary,
        r.amount
      );
    }
  }

  // ========== 查询传播统计 ==========
  getPropagationStats(pubkey, topic = null) {
    const originRewards = this.db.prepare(`
      SELECT COUNT(*) as count, SUM(reward_amount) as total, MAX(hop_count) as max_hops
      FROM propagation_rewards
      WHERE origin_pubkey = ? AND reward_type = 'origin'
      ${topic ? 'AND topic = ?' : ''}
    `).get(pubkey, ...(topic ? [topic] : []));

    const relayRewards = this.db.prepare(`
      SELECT COUNT(*) as count, SUM(reward_amount) as total
      FROM propagation_rewards
      WHERE beneficiary_pubkey = ? AND reward_type = 'relay'
      ${topic ? 'AND topic = ?' : ''}
    `).get(pubkey, ...(topic ? [topic] : []));

    return {
      as_origin: { count: originRewards.count || 0, total: originRewards.total || 0, max_hops: originRewards.max_hops || 0 },
      as_relay: { count: relayRewards.count || 0, total: relayRewards.total || 0 }
    };
  }

  // ========== 内部工具 ==========
  _msgId(msg) {
    const crypto = require('crypto');
    return crypto.createHash('sha256')
      .update(msg.payload || '')
      .update(String(msg.ts))
      .digest('hex');
  }

  _isRewarded(originPubkey, originMsgId, beneficiary, rewardType) {
    const row = this.db.prepare(`
      SELECT 1 FROM propagation_rewards
      WHERE origin_pubkey = ? AND origin_msg_id = ? AND beneficiary_pubkey = ? AND reward_type = ?
    `).get(originPubkey, originMsgId, beneficiary, rewardType);
    return !!row;
  }
}

module.exports = { PropagationEngine, PROPAGATION_CONFIG };
