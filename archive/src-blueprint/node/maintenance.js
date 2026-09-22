// node/maintenance.js — 缓存清理/同步等例行维护
class Maintenance {
  constructor() { this.tasks = []; }

  addTask(name, handler) { this.tasks.push({ name, handler }); }

  async run() {
    const results = [];
    for (const t of this.tasks) {
      try { results.push({ task: t.name, ok: true, result: await t.handler() }); }
      catch (e) { results.push({ task: t.name, ok: false, error: e.message }); }
    }
    return results;
  }
}

module.exports = new Maintenance();
