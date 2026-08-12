// agent-network/task — 任务管理
const crypto = require('crypto');

class TaskManager {
  constructor() { this.tasks = new Map(); }

  create({ from, to, type, input }) {
    const id = 'task:' + crypto.randomBytes(4).toString('hex');
    const t = {
      id, creator: from, executor: to,
      task_type: type, status: 'pending',
      input, result: null,
      createdAt: Date.now()
    };
    this.tasks.set(id, t);
    return t;
  }

  accept(id, executor) {
    const t = this.tasks.get(id);
    if (!t) throw new Error('Task not found');
    t.executor = executor;
    t.status = 'running';
    return t;
  }

  complete(id, result) {
    const t = this.tasks.get(id);
    if (!t) throw new Error('Task not found');
    t.status = 'completed';
    t.result = result;
    return t;
  }

  get(id) { return this.tasks.get(id); }
  list(creator) {
    let arr = [...this.tasks.values()];
    if (creator) arr = arr.filter(t => t.creator === creator);
    return arr;
  }
}

module.exports = new TaskManager();
