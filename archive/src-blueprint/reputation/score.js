// Phase 14 — 信誉评分
// 范围 0-1000，基础 500；positive +10，negative -20
class Score {
  calculate(events) {
    if (!Array.isArray(events)) return 500;
    let score = 500;
    for (const e of events) {
      if (e.type === 'positive')  score += 10;
      if (e.type === 'negative')  score -= 20;
    }
    return Math.max(0, Math.min(1000, score));
  }

  status(score) {
    if (score >= 800) return 'TRUSTED';
    if (score >= 500) return 'NORMAL';
    if (score >= 200) return 'WATCH';
    return 'SUSPECT';
  }

  level(score) {
    if (score >= 800) return { relay: true,  publish: true,  autoPropagate: true, storageCopies: 3 };
    if (score >= 500) return { relay: true,  publish: true,  autoPropagate: true, storageCopies: 2 };
    if (score >= 200) return { relay: false, publish: true,  autoPropagate: false, storageCopies: 1 };
    return                { relay: false, publish: false, autoPropagate: false, storageCopies: 1 };
  }
}

module.exports = new Score();
