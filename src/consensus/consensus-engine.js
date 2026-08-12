// Phase 16 — Consensus Engine
const weighted = require('./weighted-vote');

class ConsensusEngine {
  constructor() {
    this.minWeight = 1;
    this.confidenceThreshold = 0.7;
  }

  filter(votes) {
    return votes.filter(v => v.weight >= this.minWeight);
  }

  // 异常剔除：基于 IQR，丢弃超出 Q1-1.5*IQR 或 Q3+1.5*IQR 的投票
  outlierFilter(votes) {
    if (votes.length < 4) return votes;
    const weights = votes.map(v => v.weight).sort((a, b) => a - b);
    const q1 = weights[Math.floor(weights.length * 0.25)];
    const q3 = weights[Math.floor(weights.length * 0.75)];
    const iqr = q3 - q1;
    const lower = q1 - 1.5 * iqr;
    const upper = q3 + 1.5 * iqr;
    return votes.filter(v => v.weight >= lower && v.weight <= upper);
  }

  run(votes) {
    let valid = this.filter(votes);
    valid = this.outlierFilter(valid);
    const result = weighted.calculate(valid);
    result.confidence = this.confidence(result.ratio);
    result.confirmed = result.ratio >= this.confidenceThreshold || result.ratio <= (1 - this.confidenceThreshold);
    return result;
  }

  confidence(ratio) {
    return Math.abs(ratio - 0.5) * 2;
  }
}

module.exports = new ConsensusEngine();
