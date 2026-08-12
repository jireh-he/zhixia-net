// agent-network/relation — Agent 间关系图
class AgentRelationGraph {
  constructor() { this.edges = []; }

  add({ from, to, relation }) {
    this.edges.push({ from, to, relation, createdAt: Date.now() });
  }

  relations(agent) {
    return this.edges.filter(e => e.from === agent || e.to === agent);
  }
}

module.exports = new AgentRelationGraph();
