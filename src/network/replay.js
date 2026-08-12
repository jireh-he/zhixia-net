// v0.6.1 Replay protection
class ReplayProtection {
  constructor() { this.cache = new Set(); this.maxSize = 10000; }
  check(id) {
    if (this.cache.has(id)) return false;
    this.cache.add(id);
    if (this.cache.size > this.maxSize) {
      const it = this.cache.values();
      for (let i = 0; i < 1000; i++) it.next();
    }
    return true;
  }
  clear() { this.cache.clear(); }
}

module.exports = new ReplayProtection();
