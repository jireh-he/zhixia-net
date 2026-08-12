// Phase 18 — 治理投票权重（信誉 × 贡献）
const balance = require('./balance');

class GovernancePower {
  calculate(id, reputationScore) {
    const contrib = balance.get(id);
    const factor = 1 + contrib * 0.001;
    return Math.round(reputationScore * factor);
  }
}

module.exports = new GovernancePower();
