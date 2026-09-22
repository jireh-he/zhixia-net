// Trust: CommandBus 命令注册
const bus = require('../core/command-bus');
const attestation = require('./attestation');
const calculator = require('./calculator');
const score = require('./score');

bus.register('trust.rate', async (command) => {
  return attestation.create(command);
});

bus.register('trust.evidence', async (command) => {
  return attestation.list(command.target);
});

bus.register('trust.show', async (command) => {
  const cached = score.get(command.userId);
  if (cached && cached.calculated_at && (Date.now() - cached.calculated_at) < 3600000) {
    return cached;
  }
  return score.compute(command.userId);
});

bus.register('trust.compute', async (command) => {
  return score.compute(command.userId);
});
