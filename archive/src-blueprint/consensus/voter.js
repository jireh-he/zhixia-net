// Phase 16 — 投票节点
class Voter {
  constructor(id, weight) {
    this.id = id;
    this.weight = weight;
  }
  vote(target, result) {
    return { voter: this.id, target, result, weight: this.weight, time: Date.now() };
  }
}

module.exports = Voter;
