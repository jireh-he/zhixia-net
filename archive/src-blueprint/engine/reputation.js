// Layer 2: Reputation Engine — 集成 Attestation + Propagation
class ReputationEngine {
  constructor(db, attestationEngine = null, propagationEngine = null) {
    this.db = db;
    this.attestation = attestationEngine;
    this.propagation = propagationEngine;
    this.cache = new Map();
    this.maxCacheSize = 1000;
    this.blacklistThreshold = 0.1;
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
    if (this.attestation) {
      const verified = this.attestation.computeVerifiedReputation(peerPubkey, topic);
      if (verified.source === 'attestation' && verified.confidence >= 0.3) {
        const local = this._getLocalReputation(peerPubkey, topic);
        const merged = {
          peer_pubkey: peerPubkey, topic: topic,
          source: 'verified', confidence: verified.confidence,
          attestation_count: verified.attestation_count,
          technical_accuracy: verified.dimensions.technical_accuracy * 0.8 + local.technical_accuracy * 0.2,
          information_freshness: verified.dimensions.information_freshness * 0.8 + local.information_freshness * 0.2,
          collaboration: verified.dimensions.collaboration * 0.8 + local.collaboration * 0.2,
          civility: verified.dimensions.civility * 0.8 + local.civility * 0.2,
          last_interaction: local.last_interaction,
          introduced_by: local.introduced_by
        };
        this._setCache(peerPubkey, topic, merged);
        return merged;
      }
    }
    return this._getLocalReputation(peerPubkey, topic);
  }

  _getLocalReputation(peerPubkey, topic) {
    const cached = this._getFromCache(peerPubkey, topic);
    if (cached) return cached;
    const row = this.db.prepare('SELECT * FROM reputation WHERE peer_pubkey = ? AND topic = ?').get(peerPubkey, topic);
    const defaultRep = {
      peer_pubkey: peerPubkey, topic: topic,
      technical_accuracy: 0.5, information_freshness: 0.5,
      collaboration: 0.5, civility: 0.5,
      last_interaction: null, introduced_by: null
    };
    const result = row || defaultRep;
    this._setCache(peerPubkey, topic, result);
    return result;
  }

  initReputation(peerPubkey, topic, introducedBy = null) {
    const existing = this._getLocalReputation(peerPubkey, topic);
    if (existing.last_interaction !== null) return existing;
    this.db.prepare(`
      INSERT INTO reputation (peer_pubkey, topic, technical_accuracy, information_freshness, collaboration, civility, last_interaction, introduced_by)
      VALUES (?, ?, 0.5, 0.5, 0.5, 0.5, ?, ?)
      ON CONFLICT(peer_pubkey, topic) DO NOTHING
    `).run(peerPubkey, topic, Date.now(), introducedBy);
    return this._getLocalReputation(peerPubkey, topic);
  }

  updateLocalReputation(peerPubkey, topic, deltas) {
    const current = this._getLocalReputation(peerPubkey, topic);
    const alpha = 0.1;
    const newRep = { ...current };
    for (const [dim, value] of Object.entries(deltas)) {
      if (dim in newRep && typeof value === 'number') {
        newRep[dim] = current[dim] * (1 - alpha) + value * alpha;
        newRep[dim] = Math.max(0.05, Math.min(0.99, newRep[dim]));
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
      newRep.peer_pubkey, newRep.topic,
      newRep.technical_accuracy, newRep.information_freshness,
      newRep.collaboration, newRep.civility,
      newRep.last_interaction, newRep.introduced_by
    );
    this._setCache(peerPubkey, topic, newRep);
    return newRep;
  }

  // ========== 核心：消息处理后更新声誉 + 传播奖励 ==========
  updateFromMessage(peerPubkey, topic, sanitizeResult, msgType = 'text', rawMsg = null) {
    const deltas = {};
    switch (sanitizeResult.action || 'deliver') {
      case 'drop':
        deltas.civility = 0.1; deltas.collaboration = 0.3;
        break;
      case 'quarantine':
        deltas.civility = 0.3; deltas.collaboration = 0.4;
        break;
      case 'deliver':
      default:
        deltas.civility = 0.6; deltas.collaboration = 0.55;
        if (msgType === 'text' && sanitizeResult.content) {
          const text = sanitizeResult.content.toLowerCase();
          const techSignals = ['function', 'class', 'import', 'async', 'error', 'bug', 'fix', 'memory', 'leak'];
          deltas.technical_accuracy = techSignals.some(s => text.includes(s)) ? 0.65 : 0.52;
        }
        deltas.information_freshness = 0.55;
        break;
    }

    const localRep = this.updateLocalReputation(peerPubkey, topic, deltas);

    // 生成 Attestation
    let attestation = null;
    if (this.attestation) {
      attestation = this.attestation.createAttestation(peerPubkey, topic, {
        technical_accuracy: localRep.technical_accuracy,
        information_freshness: localRep.information_freshness,
        collaboration: localRep.collaboration,
        civility: localRep.civility
      }, {
        interaction_count: 1,
        last_message_hash: sanitizeResult.original_hash || null,
        reason: sanitizeResult.action === 'drop' ? 'malicious_behavior' : 'routine_interaction'
      });
    }

    // ========== 传播奖励计算 ==========
    let propagationRewards = null;
    if (this.propagation && rawMsg && rawMsg.propagation) {
      const rewardResult = this.propagation.computeRewards(rawMsg, topic);
      if (rewardResult.ok && rewardResult.rewards.length > 0) {
        // 将传播奖励应用到声誉维度
        for (const reward of rewardResult.rewards) {
          if (reward.type === 'origin') {
            // 源节点：technical_accuracy 和 information_freshness 加分
            this.updateLocalReputation(reward.beneficiary, topic, {
              technical_accuracy: Math.min(0.99, localRep.technical_accuracy + reward.amount),
              information_freshness: Math.min(0.99, localRep.information_freshness + reward.amount * 0.5)
            });
          } else if (reward.type === 'relay') {
            // 传播者：collaboration 加分
            this.updateLocalReputation(reward.beneficiary, topic, {
              collaboration: Math.min(0.99, localRep.collaboration + reward.amount)
            });
          }
        }
        this.propagation.recordRewards(
          rewardResult.rewards.find(r => r.type === 'origin')?.beneficiary || rawMsg.propagation.origin_pubkey,
          rawMsg.propagation.origin_msg_id,
          topic,
          rewardResult.rewards
        );
        propagationRewards = rewardResult.rewards;
      }
    }

    return { local: localRep, attestation, propagationRewards };
  }

  receiveAttestation(attestation) {
    if (!this.attestation) return { ok: false, error: 'Attestation engine not initialized' };
    return this.attestation.storeAttestation(attestation);
  }

  isBlacklisted(peerPubkey, topic = null) {
    if (topic) {
      const rep = this._getLocalReputation(peerPubkey, topic);
      return rep.civility < this.blacklistThreshold;
    }
    const rows = this.db.prepare('SELECT civility FROM reputation WHERE peer_pubkey = ?').all(peerPubkey);
    return rows.some(r => r.civility < this.blacklistThreshold);
  }

  computeVoteWeight(peerPubkey, topic) {
    const rep = this.getReputation(peerPubkey, topic);
    const now = Date.now();
    const daysInactive = rep.last_interaction ? (now - rep.last_interaction) / 86400000 : 999;
    const activityDecay = Math.max(0, 1 - daysInactive / 30);
    const confidence = rep.confidence || 0.1;
    return (
      rep.technical_accuracy * 0.30 +
      rep.collaboration * 0.20 +
      rep.civility * 0.25 +
      activityDecay * 0.15 +
      confidence * 0.10
    );
  }

  decayInactive(thresholdDays = 30) {
    const threshold = Date.now() - thresholdDays * 86400000;
    this.db.prepare(`
      UPDATE reputation SET
        technical_accuracy = MAX(0.05, technical_accuracy - 0.02),
        information_freshness = MAX(0.05, information_freshness - 0.02),
        collaboration = MAX(0.05, collaboration - 0.02),
        civility = MAX(0.05, civility - 0.02)
      WHERE last_interaction < ?
    `).run(threshold);
    this.cache.clear();
  }

  getTopicLeaderboard(topic, limit = 10) {
    const peers = this.db.prepare('SELECT DISTINCT peer_pubkey FROM reputation WHERE topic = ?').all(topic);
    const results = [];
    for (const { peer_pubkey } of peers) {
      const rep = this.getReputation(peer_pubkey, topic);
      results.push({
        peer_pubkey,
        overall: ((rep.technical_accuracy + rep.information_freshness + rep.collaboration + rep.civility) / 4).toFixed(3),
        confidence: (rep.confidence || 0).toFixed(3),
        attestation_count: rep.attestation_count || 0,
        source: rep.source || 'local'
      });
    }
    return results.sort((a, b) => parseFloat(b.overall) - parseFloat(a.overall)).slice(0, limit);
  }
}

module.exports = { ReputationEngine };
