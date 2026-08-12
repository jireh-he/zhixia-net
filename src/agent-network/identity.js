// agent-network/identity — Agent 身份模型
const crypto = require('crypto');

class AgentIdentity {
  constructor() { this.registry = new Map(); }

  create({ owner, name, capabilities, publicKey }) {
    const id = 'agent:' + crypto.randomBytes(4).toString('hex');
    const agent = {
      id, owner, name,
      capabilities: capabilities || [],
      publicKey,
      status: 'online',
      stats: { total: 0, completed: 0, responseTimeMs: 0, accuracy: 100, uptime: 0, userRatings: [] },
      createdAt: Date.now()
    };
    this.registry.set(id, agent);
    return agent;
  }

  get(id) { return this.registry.get(id); }
  list() { return [...this.registry.values()]; }
}

module.exports = new AgentIdentity();
