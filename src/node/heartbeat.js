// node/heartbeat.js — 心跳
class Heartbeat {
  send(nodeId) {
    return {
      type: 'node.heartbeat',
      node: nodeId || 'self',
      status: 'online',
      time: Date.now()
    };
  }
}

module.exports = new Heartbeat();
