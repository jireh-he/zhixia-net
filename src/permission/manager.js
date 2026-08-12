class PermissionManager {
  constructor() { this.rules = []; }
  grant(rule) { this.rules.push(rule); }
  check(agent, permission) {
    return this.rules.some(r => r.agent === agent && r.permission === permission);
  }
  list(agent) {
    return this.rules.filter(r => r.agent === agent);
  }
}

module.exports = new PermissionManager();
