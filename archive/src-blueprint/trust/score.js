// Trust: Score — 信誉分缓存 + 持久化
const { initDatabase } = require('../engine/database');
const calculator = require('./calculator');

class TrustScore {
  constructor() {
    this.db = initDatabase();
  }

  async compute(userId) {
    // 从数据库读所有 attestation，构建 edges
    const atts = this.db.prepare(
      'SELECT * FROM trust_attestations'
    ).all();

    const edges = atts.map(a => ({
      from: a.from_user, to: a.target_user,
      value: a.value, type: a.type, createdAt: a.created_at
    }));

    const { content, network, activity, total, count } = calculator.calculate(userId, edges);

    // 写回缓存表
    this.db.prepare(
      'INSERT OR REPLACE INTO trust_scores (user_id, content_score, network_score, activity_score, total_score, calculated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(userId, content, network, activity, total, Date.now());

    return { content, network, activity, total, count };
  }

  get(userId) {
    return this.db.prepare(
      'SELECT * FROM trust_scores WHERE user_id = ?'
    ).get(userId);
  }

  cache(scores, userId) {
    this.db.prepare(
      'INSERT OR REPLACE INTO trust_scores (user_id, content_score, network_score, activity_score, total_score, calculated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(userId, scores.content, scores.network, scores.activity, scores.total, Date.now());
  }
}

module.exports = new TrustScore();
