// Phase 15 — Sybil 检测器
// 规则检测（可升级图算法 / PageRank）
class SybilDetector {
  constructor() {
    this.rules = [
      // 单一目标被大量评价
      (ctx) => { if (ctx.incomingCount > 100) return { risk: 'HIGH', reason: 'excessive_incoming_evals' }; },
      // 新身份短时间内大量评价
      (ctx) => { if (ctx.ageHours < 24 && ctx.evaluationCount > 20) return { risk: 'HIGH', reason: 'new_identity_high_eval_rate' }; },
      // 互相评价闭环（密度 > 0.8）
      (ctx) => { if (ctx.clusteringCoefficient > 0.8 && ctx.evaluationCount > 5) return { risk: 'MEDIUM', reason: 'high_clustering' }; },
      // 集中攻击模式：所有评价者只评一个目标
      (ctx) => { if (ctx.targetConcentration > 0.95 && ctx.evaluationCount > 10) return { risk: 'HIGH', reason: 'target_concentration' }; },
      // 时间同步模式
      (ctx) => { if (ctx.timeVariance < 1000 && ctx.evaluationCount > 5) return { risk: 'MEDIUM', reason: 'synchronized_timing' }; },
    ];
  }

  detect(ctx) {
    for (const rule of this.rules) {
      const result = rule(ctx);
      if (result) return result;
    }
    return { risk: 'LOW', reason: 'normal' };
  }

  // 简化接口：只传 graph 和 id
  detectFromGraph(graph, id) {
    const incoming = graph.getIncoming(id);
    const result = this.detect({
      incomingCount: incoming.length,
      evaluationCount: incoming.length,
      ageHours: 24 * 7,           // 默认假设，可后续用实际数据
      clusteringCoefficient: 0.3,
      targetConcentration: incoming.length > 0 ? 1 : 0,
      timeVariance: 0
    });
    return result;
  }
}

module.exports = new SybilDetector();
