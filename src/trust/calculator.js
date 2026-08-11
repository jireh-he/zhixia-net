// Trust: Calculator — 多维信誉计算
// 输入：信任图 edges → 输出：content/network/activity 三维度分数
class TrustCalculator {
  calculate(user, edges) {
    const incoming = edges.filter(e => e.to === user);
    if (incoming.length === 0) {
      return { content: 0, network: 0, activity: 0, total: 0, count: 0 };
    }

    const typeScores = { content: [], network: [], activity: [] };
    const typeMap = {
      content_quality: 'content', content_value: 'content',
      network_contribution: 'network', reliability: 'network',
      activity: 'activity', availability: 'activity'
    };

    for (const e of incoming) {
      const dim = typeMap[e.type] || 'content';
      typeScores[dim].push(e.value);
    }

    const content = this._avg(typeScores.content);
    const network = this._avg(typeScores.network);
    const activity = this._avg(typeScores.activity);
    const total = Math.round((content + network + activity) / 3);

    return {
      content: Math.round(content),
      network: Math.round(network),
      activity: Math.round(activity),
      total,
      count: incoming.length
    };
  }

  _avg(arr) {
    return arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;
  }
}

module.exports = new TrustCalculator();
