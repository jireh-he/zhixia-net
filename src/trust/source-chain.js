// v0.6.4 Source Chain — 内容溯源
class SourceChain {
  constructor() { this.links = []; }
  add(parent, child) { this.links.push({ parent, child, time: Date.now() }); }
  getParent(cid)     { return this.links.find(x => x.child === cid); }
  getChildren(cid)   { return this.links.filter(x => x.parent === cid); }
  lineage(cid)       {
    const path = [cid];
    let cur = cid;
    while ((cur = this.getParent(cur))) { path.unshift(cur.parent); cur = cur.parent; }
    return path;
  }
}

module.exports = new SourceChain();
