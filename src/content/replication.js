// v0.6.3 Replication — 内容复制策略
class Replication {
  constructor() { this.defaultCopies = 3; }
  need(current) { return Math.max(0, this.defaultCopies - current); }
  targetsAvailable(targets) { return targets.filter(t => t.status === 'online'); }
}

module.exports = new Replication();
