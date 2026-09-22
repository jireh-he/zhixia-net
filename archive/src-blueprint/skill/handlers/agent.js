// agent.* handlers — 转发到 agent-network 模块
const registry = require('../registry');
const discovery = require('../../agent-network/discovery');
const delegation = require('../../agent-network/delegation');
const task = require('../../agent-network/task');
const reputation = require('../../agent-network/reputation');

registry.register('agent.find', async (args) => {
  const found = discovery.find(args.capability);
  const result = found.map(a => ({ id: a.id, score: reputation.calculate(a.stats) }));
  return result;
});

registry.register('agent.delegate', async (args) => {
  const targetId = args.executor || args.agent;
  const agent = discovery.agents.get(targetId);
  if (!agent) throw new Error('Agent not found: ' + targetId);
  return delegation.delegate(agent, { executor: targetId, type: args.task, input: args.input });
});

registry.register('agent.task.status', async (args) => {
  return task.get(args.task);
});

registry.register('agent.reputation', async (args) => {
  const agent = discovery.agents.get(args.agent);
  if (!agent) throw new Error('Agent not found');
  return { id: args.agent, score: reputation.calculate(agent.stats) };
});
