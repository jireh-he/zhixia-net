// resource/quota — 限额管理
class QuotaManager {
  constructor() { this.rules = new Map(); }

  set(agent, type, limit) {
    const key = `${agent}:${type}`;
    this.rules.set(key, { agent, type, limit, used: this._used(key) || 0 });
  }

  consume(agent, type, amount) {
    const key = `${agent}:${type}`;
    const rule = this.rules.get(key);
    if (!rule) return { allowed: true };
    if (rule.used + amount > rule.limit) return { allowed: false, used: rule.used, limit: rule.limit };
    rule.used += amount;
    return { allowed: true, used: rule.used, limit: rule.limit };
  }

  _used(key) {
    for (const [k, v] of this.rules) if (k === key) return v.used;
    return 0;
  }

  list(agent) {
    return [...this.rules.values()].filter(r => !agent || r.agent === agent);
  }
}

module.exports = new QuotaManager();
