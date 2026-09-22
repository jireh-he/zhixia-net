// Phase 18 — Incentive Engine
const reward = require('./reward');
const balance = require('./balance');
const proof = require('./proof');

class IncentiveEngine {
  process(contribution) {
    const check = proof.verify(contribution);
    if (!check.valid) return 0;
    const amount = reward.calculate(contribution);
    balance.add(contribution.node, amount);
    return amount;
  }

  summary(nodeId) {
    return { node: nodeId, balance: balance.get(nodeId) };
  }
}

module.exports = new IncentiveEngine();
