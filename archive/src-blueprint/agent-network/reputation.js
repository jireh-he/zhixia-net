// agent-network/reputation — Agent 信誉评分
// 维度：任务完成率 + 响应速度 + 正确率 + 用户评价 + 在线时间
class AgentReputation {
  calculate(stats) {
    if (!stats || stats.total === 0) return 0;
    const completion = (stats.completed / stats.total) * 40;
    const speed      = Math.min(20, (500 / Math.max(1, stats.responseTimeMs)) * 100);
    const accuracy   = (stats.accuracy / 100) * 20;
    const rating     = stats.userRatings.length
      ? ((stats.userRatings.reduce((a, b) => a + b, 0) / stats.userRatings.length / 100) * 15)
      : 0;
    const uptime     = Math.min(5, (stats.uptime / 1000) * 5);
    return Math.round(completion + speed + accuracy + rating + uptime);
  }
}

module.exports = new AgentReputation();
