// Core: Command Bus
// 统一 CLI 和未来 AI Agent 的调用入口
// 设计原则：同步路由，handler 自身决定是否 async

class CommandBus {
  constructor() {
    this.handlers = new Map();
  }

  register(action, handler) {
    if (this.handlers.has(action)) {
      throw new Error(`Command already registered: ${action}`);
    }
    this.handlers.set(action, handler);
  }

  async execute(command) {
    if (!command || !command.action) {
      throw new Error('Invalid command: missing action');
    }

    const handler = this.handlers.get(command.action);
    if (!handler) {
      throw new Error(`Unknown command: ${command.action}`);
    }

    return await handler(command);
  }

  has(action) {
    return this.handlers.has(action);
  }

  list() {
    return Array.from(this.handlers.keys());
  }
}

module.exports = new CommandBus();