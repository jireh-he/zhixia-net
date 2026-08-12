// agent-network/discovery — Agent 发现与注册
class AgentDiscovery {
  constructor() { this.agents = new Map(); }

  register(agent) {
    this.agents.set(agent.id, agent);
  }

  find(capability) {
    return [...this.agents.values()].filter(a =>
      (a.capabilities || []).includes(capability)
    );
  }

  list() { return [...this.agents.values()]; }
}

module.exports = new AgentDiscovery();
