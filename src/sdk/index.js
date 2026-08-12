// Phase 21 — zhixia Agent SDK：给外部 AI Agent 使用
const path = require('path');

class ZhixiaSDK {
  constructor(opts = {}) {
    this.cwd = opts.cwd || process.cwd();
    this.runtime = null;
  }

  async connect(opts = {}) {
    this.runtime = require('../src/skills/runtime');
    this.runtime.registerManifest();
    return { ok: true, skills: this.runtime.list() };
  }

  async skill(name, input = {}) {
    if (!this.runtime) await this.connect();
    const result = await this.runtime.execute(name, input);
    return result;
  }

  // 快捷方法
  async identity() { return this.skill('zhixia.identity', {}); }
  async message(opts) { return this.skill('zhixia.message', opts); }
  async storage(opts) { return this.skill('zhixia.storage', opts); }
  async reputation(id) { return this.skill('zhixia.reputation', { id }); }
  async market(opts) { return this.skill('zhixia.market', opts); }
  async network(opts) { return this.skill('zhixia.network', opts); }
}

module.exports = {
  ZhixiaSDK,
  create(opts) { return new ZhixiaSDK(opts); }
};
