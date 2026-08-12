// Phase 18 — 奖励计算
class Reward {
  constructor() {
    this.rates = {
      storage: 0.1,
      relay: 0.05,
      message: 0.01,
      compute: 0.2
    };
  }

  calculate(contribution) {
    const rate = this.rates[contribution.type] || 0.01;
    return contribution.value * rate;
  }

  setRate(type, rate) { this.rates[type] = rate; }
  getRates() { return this.rates; }
}

module.exports = new Reward();
