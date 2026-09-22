// Phase 15 — Security Manager（统一入口）
const identityWeight = require('./identity-weight');
const trustGraph = require('./trust-graph');
const sybil = require('./sybil-detector');
const abuse = require('./abuse-monitor');
const repScore = require('../reputation/score');

class SecurityManager {
  checkIdentity(id, identityInfo) {
    const weight = identityWeight.calculate(identityInfo || {});
    const sybilResult = sybil.detectFromGraph(trustGraph, id);
    const abuseResult = abuse.check(id);

    return {
      id,
      weight,
      tier: identityWeight.tier(weight),
      sybil: sybilResult,
      abuse: abuseResult,
      trustFactor: trustGraph.trustScore(id),
      final: this.finalRating(weight, sybilResult, abuseResult)
    };
  }

  finalRating(weight, sybilResult, abuseResult) {
    if (sybilResult.risk === 'HIGH') return 'LIMITED';
    if (abuseResult.abusive)         return 'BLOCKED';
    if (weight >= 5)                 return 'TRUSTED';
    if (weight >= 2)                 return 'NORMAL';
    return 'LIMITED';
  }

  // 综合信誉 = baseScore * weight * trustFactorNorm
  weightedReputation(baseScore, identityInfo, id) {
    const w = identityWeight.calculate(identityInfo || {});
    const tf = Math.max(0.1, 1 + trustGraph.trustScore(id) * 0.01);
    return Math.round(baseScore * w * tf);
  }

  // 网络权限判定
  can(id, action, identityInfo) {
    const report = this.checkIdentity(id, identityInfo);
    const isHighSybil = report.sybil.risk === 'HIGH';
    switch (action) {
      case 'relay':         return report.final === 'TRUSTED' && !isHighSybil;
      case 'bootstrap':     return report.final === 'TRUSTED' && report.weight >= 5 && !isHighSybil;
      case 'storage':       return report.final !== 'BLOCKED';
      case 'publish':       return report.final !== 'BLOCKED' && !isHighSybil;
      case 'autoPropagate': return report.final === 'TRUSTED';
      default:              return true;
    }
  }
}

module.exports = new SecurityManager();
