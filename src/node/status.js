// node/status.js — 节点状态查询（汇总）
const node = require('./node');
const monitor = require('./monitor');

class NodeStatus {
  full() {
    return {
      node: node.statusInfo(),
      resources: monitor.collect()
    };
  }
}

module.exports = new NodeStatus();
