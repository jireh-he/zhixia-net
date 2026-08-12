const agent = require('./src/agent-network');
const discovery = agent.discovery;

const a1 = agent.identity.create({ owner: 'zid:A', name: 'researcher', capabilities: ['search', 'analysis'] });
const a2 = agent.identity.create({ owner: 'zid:A', name: 'publisher', capabilities: ['publish'] });
discovery.register(a1);
discovery.register(a2);

(async () => {
  console.log('registered:', discovery.list().length);
  console.log('find analysis:', discovery.find('analysis').map(x => x.name));
  console.log('find publish:', discovery.find('publish').map(x => x.name));

  const rel = agent.relation;
  rel.add({ from: a1.id, to: a2.id, relation: 'trusts' });
  console.log('relations a1:', rel.relations(a1.id).length);

  const task = agent.task.create({ from: a1.id, to: a2.id, type: 'content.analysis', input: 'cid001' });
  console.log('task created:', task.id, task.status);
  agent.task.accept(task.id, a2.id);
  const updated = agent.task.get(task.id);
  console.log('after accept:', updated.status);
  agent.task.complete(task.id, { summary: 'ok' });
  console.log('after complete:', agent.task.get(task.id).status, agent.task.get(task.id).result.summary);

  const rep = agent.reputation.calculate({ total: 10, completed: 9, responseTimeMs: 200, accuracy: 95, uptime: 5000, userRatings: [4.5, 4.8] });
  console.log('reputation score:', rep);
})();
