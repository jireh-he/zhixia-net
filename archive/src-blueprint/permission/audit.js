// audit — Agent 行为审计日志
class AuditLog {
  constructor() { this.entries = []; }

  record(entry) {
    this.entries.push({ ...entry, time: Date.now() });
    return this.entries[this.entries.length - 1];
  }

  query({ agent, action, limit = 50 } = {}) {
    let q = this.entries;
    if (agent) q = q.filter(e => e.agent === agent);
    if (action) q = q.filter(e => e.action === action);
    return q.slice(-limit);
  }
}

module.exports = new AuditLog();
