// resource/contribution — 贡献计算
// relay×1, storage×2, compute×3
class ContributionCalculator {
  calculate(events) {
    let score = 0;
    for (const e of events) {
      switch (e.resource_type) {
        case 'relay':   score += e.amount;       break;
        case 'storage': score += e.amount * 2;   break;
        case 'compute': score += e.amount * 3;   break;
      }
    }
    return Math.round(score);
  }
}

module.exports = new ContributionCalculator();
