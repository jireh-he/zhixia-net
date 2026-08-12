// agent-network/protocol — Task 协议
class AgentProtocol {
  createTask(data) { return { type: 'agent.task', data }; }
  accept(id)      { return { type: 'agent.task.accept', id }; }
  complete(id, result) { return { type: 'agent.task.complete', id, result }; }
}

module.exports = new AgentProtocol();
