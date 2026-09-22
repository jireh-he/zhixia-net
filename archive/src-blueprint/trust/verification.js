// v0.6.4 Verification — 多节点验证
class Verification {
  constructor() { this.events = []; }
  add(event) { this.events.push({ ...event, timestamp: Date.now() }); }
  score(cid) {
    const list = this.events.filter(e => e.cid === cid);
    if (list.length === 0) return 0;
    const good = list.filter(e => e.result === 'ok').length;
    return Math.round((good / list.length) * 100);
  }
  list(cid) { return this.events.filter(e => e.cid === cid); }
}

module.exports = new Verification();
