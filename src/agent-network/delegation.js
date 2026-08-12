// agent-network/delegation — 任务委托
const taskManager = require('./task');
const protocol = require('./protocol');

class Delegation {
  async delegate(agent, taskSpec) {
    const task = taskManager.create({
      from: agent.id,
      to: taskSpec.executor || 'unassigned',
      type: taskSpec.type,
      input: taskSpec.input
    });
    return { task, envelope: protocol.createTask(task) };
  }
}

module.exports = new Delegation();
