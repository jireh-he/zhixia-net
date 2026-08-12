// resource.* handlers
const registry = require('../registry');
const meter = require('../../resource/meter');
const contribution = require('../../resource/contribution');
const usage = require('../../resource/usage');

registry.register('resource.query', async (args) => {
  return usage.all(args.agent);
});

registry.register('resource.usage', async (args) => {
  return meter.query(args.agent, args.type);
});

registry.register('resource.contribution', async (args) => {
  const events = meter.query(args.agent);
  const total = contribution.calculate(events);
  const byType = usage.byType(events);
  return { ...byType, score: total };
});
