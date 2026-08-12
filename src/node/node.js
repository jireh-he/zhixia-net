// node/node.js — 节点生命周期与状态
class Node {
  constructor() {
    this.status = 'STOPPED';
    this.services = [];
    this.startupTime = null;
  }

  async start() {
    this.status = 'STARTING';
    this.loadServices();
    this.status = 'ONLINE';
    this.startupTime = Date.now();
    return this.statusInfo();
  }

  async stop() {
    this.status = 'STOPPING';
    this.services = [];
    this.status = 'STOPPED';
    return this.statusInfo();
  }

  loadServices() {
    this.services = ['network', 'message', 'content', 'trust', 'agent', 'resource'];
  }

  statusInfo() {
    return {
      status: this.status,
      services: [...this.services],
      uptimeMs: this.startupTime ? Date.now() - this.startupTime : 0
    };
  }
}

module.exports = new Node();
