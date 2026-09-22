// v0.6.4 Trust Aggregator — 聚合所有信任维度
const contentScore = require('./content-score');

class TrustAggregator {
  aggregate(cid, factors) {
    return contentScore.calculate(cid, factors);
  }
}

module.exports = new TrustAggregator();
