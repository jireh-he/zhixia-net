// Phase 16 — Dispute 争议处理
class Dispute {
  constructor() { this.cases = []; this.nextId = 1; }

  create(target, reason, reporter) {
    const item = {
      id: 'dispute:' + (this.nextId++),
      target,
      reason,
      reporter: reporter || 'self',
      time: Date.now(),
      status: 'pending'
    };
    this.cases.push(item);
    return item;
  }

  vote(caseId, result, voterId) {
    const c = this.cases.find(x => x.id === caseId);
    if (!c) return null;
    if (!c.votes) c.votes = [];
    c.votes.push({ voter: voterId, result, time: Date.now() });
    c.status = 'voting';
    return c;
  }

  resolve(caseId, result) {
    const c = this.cases.find(x => x.id === caseId);
    if (!c) return null;
    c.status = 'resolved';
    c.result = result;
    c.resolvedAt = Date.now();
    return c;
  }

  list(status) {
    if (!status) return this.cases;
    return this.cases.filter(c => c.status === status);
  }

  pending() { return this.list('pending').concat(this.list('voting')); }
}

module.exports = new Dispute();
