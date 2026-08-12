// Phase 14 — 评价者模块
const ReputationEvent = require('./reputation-event');

class Evaluator {
  observe(action) {
    return new ReputationEvent({
      type: action.type,      // positive / negative
      source: action.source,
      target: action.target,
      observer: action.observer || 'self',
      detail: action.detail || {}
    });
  }

  // 自动判定：根据 action 名映射到 positive/negative
  fromNetworkEvent(actionName, target) {
    const positive = ['message.received', 'relay.ack', 'storage.provided', 'content.verify.ok'];
    const negative = ['spam.reported', 'relay.timeout', 'storage.failed', 'content.verify.bad', 'auth.denied'];
    let type;
    if (positive.includes(actionName))   type = 'positive';
    else if (negative.includes(actionName)) type = 'negative';
    else return null;
    return this.observe({ type, target, detail: { actionName } });
  }
}

module.exports = new Evaluator();
