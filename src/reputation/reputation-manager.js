// Phase 14 — Reputation Manager（统一入口）
const evaluator = require('./evaluator');
const score = require('./score');
const store = require('./reputation-store');
const consensus = require('./consensus');

class ReputationManager {
  // 记录一条评价事件（防自改）
  record(action) {
    const event = evaluator.observe(action);
    return store.append(event.target, event);
  }

  // 从网络事件自动记账
  fromNetwork(actionName, target, observer) {
    const evt = evaluator.fromNetworkEvent(actionName, target);
    if (!evt) return null;
    evt.observer = observer || 'self';
    return store.append(evt.target, evt);
  }

  // 计算本地节点视角的分数
  local(id) {
    const events = store.get(id);
    return { score: score.calculate(events), status: score.status(score.calculate(events)), events: events.length };
  }

  // 多节点共识
  consensus(id, remoteScores) {
    const local = this.local(id);
    const all = [local.score, ...(remoteScores || [])];
    return {
      consensusScore: consensus.calculate(all),
      localScore: local.score,
      variance: consensus.variance(all),
      participants: all.length,
      status: score.status(consensus.calculate(all)),
      level: score.level(consensus.calculate(all))
    };
  }

  // 查询事件列表
  events(id) { return store.get(id); }

  // 查询所有
  list() { return store.list(); }
}

module.exports = new ReputationManager();
