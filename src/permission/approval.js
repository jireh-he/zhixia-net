// approval — 高风险操作人工确认
const crypto = require('crypto');

class ApprovalManager {
  constructor() { this.requests = new Map(); }

  create(agent, action) {
    const id = 'approval:' + crypto.randomBytes(8).toString('hex');
    const req = {
      id, agent, action,
      status: 'pending',
      createdAt: Date.now()
    };
    this.requests.set(id, req);
    return req;
  }

  approve(id) {
    const r = this.requests.get(id);
    if (!r) throw new Error('Approval not found');
    r.status = 'approved';
    return r;
  }

  reject(id) {
    const r = this.requests.get(id);
    if (!r) throw new Error('Approval not found');
    r.status = 'rejected';
    return r;
  }

  list() { return [...this.requests.values()]; }
}

module.exports = new ApprovalManager();
