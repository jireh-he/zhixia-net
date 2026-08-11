// Layer 2: Reputation Attestation
// 核心设计：声誉不是自评的，而是"他证"的
// 每次交互后，双方交换签名过的声誉评价（Attestation）
// 本地数据库只是缓存，真正的声誉在 P2P 网络中由他人背书

const crypto = require('hypercore-crypto');

class AttestationEngine {
  constructor(db, keyPair) {
    this.db = db;
    this.keyPair = keyPair; // 本机 ed25519 密钥对
  }

  // ========== 生成声誉证明 ==========
  // 评价者对被评价者生成签名评价
  // 这个证明可以被被评价者展示给其他节点，也可以被评价者自己保留作为证据
  createAttestation(targetPubkey, topic, dimensions, context = {}) {
    const now = Date.now();
    const body = {
      version: 1,
      type: 'reputation_attestation',
      issuer: this.keyPair.publicKey.toString('hex'),
      target: targetPubkey,
      topic: topic,
      dimensions: {
        technical_accuracy: Math.max(0, Math.min(1, dimensions.technical_accuracy || 0.5)),
        information_freshness: Math.max(0, Math.min(1, dimensions.information_freshness || 0.5)),
        collaboration: Math.max(0, Math.min(1, dimensions.collaboration || 0.5)),
        civility: Math.max(0, Math.min(1, dimensions.civility || 0.5))
      },
      context: {
        interaction_count: context.interaction_count || 1,
        last_message_hash: context.last_message_hash || null,
        reason: context.reason || 'routine_interaction'
      },
      issued_at: now,
      expires_at: now + 30 * 24 * 60 * 60 * 1000 // 30 天有效期
    };

    const sigPayload = Buffer.from(JSON.stringify(body));
    const signature = crypto.sign(sigPayload, this.keyPair.secretKey).toString('hex');

    return {
      ...body,
      signature
    };
  }

  // ========== 验证声誉证明 ==========
  verifyAttestation(attestation) {
    try {
      // 1. 检查结构
      if (!attestation.signature || !attestation.issuer || !attestation.target) {
        return { ok: false, error: 'Missing required fields' };
      }

      // 2. 检查有效期
      const now = Date.now();
      if (attestation.expires_at && attestation.expires_at < now) {
        return { ok: false, error: 'Attestation expired' };
      }

      // 3. 验证签名
      const { signature, ...body } = attestation;
      const sigPayload = Buffer.from(JSON.stringify(body));
      const issuerPubkey = Buffer.from(attestation.issuer, 'hex');
      const sig = Buffer.from(signature, 'hex');

      const valid = crypto.verify(sigPayload, sig, issuerPubkey);
      if (!valid) {
        return { ok: false, error: 'Invalid signature' };
      }

      // 4. 防重放：检查是否已接收过相同证明
      const existing = this.db.prepare(
        'SELECT 1 FROM attestations WHERE attestation_id = ?'
      ).get(this._attestationId(attestation));
      if (existing) {
        return { ok: false, error: 'Duplicate attestation (replay)' };
      }

      return { ok: true, body };
    } catch (e) {
      return { ok: false, error: `Verification exception: ${e.message}` };
    }
  }

  // ========== 存储他人给我的证明 ==========
  storeAttestation(attestation) {
    const verifyResult = this.verifyAttestation(attestation);
    if (!verifyResult.ok) {
      return verifyResult;
    }

    const id = this._attestationId(attestation);
    this.db.prepare(`
      INSERT INTO attestations (
        attestation_id, issuer_pubkey, target_pubkey, topic,
        technical_accuracy, information_freshness, collaboration, civility,
        issued_at, expires_at, signature, raw_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      attestation.issuer,
      attestation.target,
      attestation.topic,
      attestation.dimensions.technical_accuracy,
      attestation.dimensions.information_freshness,
      attestation.dimensions.collaboration,
      attestation.dimensions.civility,
      attestation.issued_at,
      attestation.expires_at,
      attestation.signature,
      JSON.stringify(attestation)
    );

    return { ok: true, id };
  }

  // ========== 计算加权声誉（基于他人证明） ==========
  // 核心：我的声誉 = 别人给我签名的评价集合的加权平均
  computeVerifiedReputation(targetPubkey, topic, options = {}) {
    const minAttestations = options.minAttestations || 1;
    const maxAge = options.maxAge || 30 * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - maxAge;

    // 查询所有有效的他人证明
    const rows = this.db.prepare(`
      SELECT issuer_pubkey, technical_accuracy, information_freshness, collaboration, civility, issued_at
      FROM attestations
      WHERE target_pubkey = ? AND topic = ? AND issued_at > ?
      ORDER BY issued_at DESC
    `).all(targetPubkey, topic, cutoff);

    if (rows.length < minAttestations) {
      // 证明不足，回退到默认声誉 + 本地观察
      return {
        source: 'default',
        confidence: 0.1,
        attestation_count: rows.length,
        dimensions: {
          technical_accuracy: 0.5,
          information_freshness: 0.5,
          collaboration: 0.5,
          civility: 0.5
        }
      };
    }

    // 加权平均：越新的证明权重越高
    let totalWeight = 0;
    const sums = { technical_accuracy: 0, information_freshness: 0, collaboration: 0, civility: 0 };

    for (const row of rows) {
      // 时间衰减权重：最近 7 天权重 1.0，30 天权重 0.3
      const age = Date.now() - row.issued_at;
      const weight = Math.max(0.3, 1 - age / maxAge);
      totalWeight += weight;

      sums.technical_accuracy += row.technical_accuracy * weight;
      sums.information_freshness += row.information_freshness * weight;
      sums.collaboration += row.collaboration * weight;
      sums.civility += row.civility * weight;
    }

    const result = {
      source: 'attestation',
      confidence: Math.min(1, rows.length / 10), // 10 个以上证明达到最高置信度
      attestation_count: rows.length,
      dimensions: {
        technical_accuracy: sums.technical_accuracy / totalWeight,
        information_freshness: sums.information_freshness / totalWeight,
        collaboration: sums.collaboration / totalWeight,
        civility: sums.civility / totalWeight
      }
    };

    return result;
  }

  // ========== 获取我可以展示给他人的证明 ==========
  // 即：别人给我的好评，我收集起来作为"声誉简历"
  getMyAttestations(myPubkey, topic, limit = 20) {
    return this.db.prepare(`
      SELECT issuer_pubkey, dimensions, issued_at, signature
      FROM attestations
      WHERE target_pubkey = ? AND topic = ?
      ORDER BY issued_at DESC
      LIMIT ?
    `).all(myPubkey, topic, limit);
  }

  // ========== Gossip 传播：获取需要广播的证明 ==========
  getAttestationsForGossip(since = null) {
    const cutoff = since || Date.now() - 24 * 60 * 60 * 1000; // 最近 24h
    return this.db.prepare(`
      SELECT raw_json FROM attestations WHERE received_at > ?
    `).all(cutoff).map(r => JSON.parse(r.raw_json));
  }

  // ========== 内部工具 ==========
  _attestationId(attestation) {
    const crypto = require('crypto');
    return crypto.createHash('sha256')
      .update(attestation.issuer + attestation.target + attestation.issued_at)
      .digest('hex');
  }
}

module.exports = { AttestationEngine };
