// Phase 17 — 治理投票（信誉加权）
class Voting {
  constructor() { this.votes = []; this.quorum = 0.5; }

  vote(proposalId, voter, choice) {
    this.votes.push({ proposal: proposalId, voter, weight: voter.weight || 1, choice, time: Date.now() });
    return this.result(proposalId);
  }

  result(proposalId) {
    const vs = this.votes.filter(v => v.proposal === proposalId);
    const totalWeight = vs.reduce((s, v) => s + v.weight, 0);
    const yesWeight = vs.filter(v => v.choice === 'yes').reduce((s, v) => s + v.weight, 0);
    const noWeight = vs.filter(v => v.choice === 'no').reduce((s, v) => s + v.weight, 0);
    const ratio = totalWeight > 0 ? yesWeight / totalWeight : 0;
    return {
      yes: yesWeight,
      no: noWeight,
      total: totalWeight,
      ratio: Math.round(ratio * 100) / 100,
      passed: yesWeight > noWeight && ratio >= this.quorum,
      quorum: this.quorum
    };
  }
}

module.exports = new Voting();
