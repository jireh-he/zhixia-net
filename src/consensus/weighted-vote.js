// Phase 16 — 加权投票算法
class WeightedVote {
  calculate(votes) {
    let positive = 0, negative = 0;
    for (const v of votes) {
      if (v.result === 'positive') positive += v.weight;
      if (v.result === 'negative') negative += v.weight;
    }
    return {
      positive,
      negative,
      total: positive + negative,
      ratio: (positive + negative > 0) ? positive / (positive + negative) : 0.5,
      result: positive >= negative ? 'positive' : 'negative'
    };
  }
}

module.exports = new WeightedVote();
