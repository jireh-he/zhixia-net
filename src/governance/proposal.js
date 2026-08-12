// Phase 17 — 治理提案
class Proposal {
  constructor(data) {
    this.id = 'proposal:' + Date.now();
    this.creator = data.creator;
    this.title = data.title;
    this.description = data.description || '';
    this.change = data.change;
    this.status = 'voting';
    this.created = Date.now();
    this.votes = [];
  }
}

module.exports = Proposal;
