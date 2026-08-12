// trust.query — 查询用户信誉
const registry = require('../registry');
const calculator = require('../../trust/calculator');
const graph = require('../../trust/graph');

registry.register('trust.query', async (args) => {
  const edges = graph.incoming(args.user);
  return calculator.calculate(args.user, edges);
});
