// v0.6.4 Propagation — 传播链事件
class PropagationGraph {
  constructor() { this.events = []; }
  record(event) { this.events.push({ ...event, timestamp: Date.now() }); }
  getChain(cid) { return this.events.filter(e => e.cid === cid); }
  count(cid)    { return this.getChain(cid).length; }
}

module.exports = new PropagationGraph();
