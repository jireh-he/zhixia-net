// v0.6.4 Content Score — 内容综合评分
// 作者信誉 30% + 传播质量 25% + 验证结果 30% + 用户评价 15%
class ContentScore {
  constructor() {
    this.scores = new Map();
    this.weights = { author: 0.30, propagation: 0.25, verification: 0.30, user: 0.15 };
  }
  calculate(cid, { authorScore, propagationScore, verificationScore, userScore }) {
    const total = Math.round(
      authorScore * this.weights.author +
      propagationScore * this.weights.propagation +
      verificationScore * this.weights.verification +
      userScore * this.weights.user
    );
    this.scores.set(cid, { author: authorScore, propagation: propagationScore, verification: verificationScore, user: userScore, total });
    return this.scores.get(cid);
  }
  get(cid) { return this.scores.get(cid); }
}

module.exports = new ContentScore();
