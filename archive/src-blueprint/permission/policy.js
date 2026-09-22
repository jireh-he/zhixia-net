// policy — 存储 agent 到权限规则映射（可扩展为持久化）
class PolicyStore {
  constructor() { this.policies = new Map(); }
  set(agent, permission, scope, expiresAt) {
    this.policies.set(`${agent}:${permission}:${scope}`, {
      agent, permission, scope, expiresAt, createdAt: Date.now()
    });
  }
  get(agent) {
    const result = [];
    for (const [key, v] of this.policies.entries()) {
      if (v.agent === agent && (!v.expiresAt || v.expiresAt > Date.now())) {
        result.push(v);
      }
    }
    return result;
  }
}

module.exports = new PolicyStore();
