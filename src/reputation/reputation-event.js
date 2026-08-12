// Phase 14 — 信誉事件模型
// 结构：{ id, type, source, target, observer, time }
class ReputationEvent {
  constructor(data) {
    this.id = data.id || ('ev:' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
    this.type = data.type;        // 'positive' | 'negative'
    this.source = data.source;    // 行为发起方
    this.target = data.target;    // 被评价方（关键：本节点不能自评价）
    this.observer = data.observer || 'self';
    this.detail = data.detail || {};
    this.time = data.time || Date.now();
  }
}

module.exports = ReputationEvent;
