// Phase 14 — 信誉存储
// 内存 Map + 可选文件持久化；key = zid，value = events[]
class ReputationStore {
  constructor() { this.data = new Map(); }

  get(id) { return this.data.get(id) || []; }

  set(id, events) { this.data.set(id, events); }

  has(id) { return this.data.has(id); }

  list() {
    const out = [];
    for (const [id, events] of this.data) out.push({ id, events });
    return out;
  }

  // 追加单条事件（防自改：target !== observer）
  append(id, event) {
    const list = this.get(id);
    if (event.target === event.observer) {
      throw new Error('Self-evaluation denied: target === observer');
    }
    list.push(event);
    this.set(id, list);
    return event;
  }
}

module.exports = new ReputationStore();
