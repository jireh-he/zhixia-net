// v0.6.4 Reputation Weight
class ReputationWeight {
  level(role) {
    switch (role) {
      case 'high': return 10;
      case 'long-term': return 5;
      case 'default': return 1;
      default: return 1;
    }
  }
  apply(score, role) { return score * this.level(role); }
}

module.exports = new ReputationWeight();
