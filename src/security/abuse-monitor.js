// Phase 15 — Abuse Monitor
// 监控异常行为：事件流 + 频率检测 + 黑名单
class AbuseMonitor {
  constructor() {
    this.events = [];
    this.blacklist = new Set();
    this.windows = new Map();    // id -> [时间戳数组]
  }

  record(event) {
    this.events.push({ ...event, time: Date.now() });
    const src = event.source;
    if (!this.windows.has(src)) this.windows.set(src, []);
    this.windows.get(src).push(Date.now());
  }

  check(id) {
    const events = this.events.filter(e => e.source === id);
    const blocked = this.blacklist.has(id);
    // 滑动窗口频率检测：过去 60s 超过 100 次判滥用
    const window = this.windows.get(id) || [];
    const now = Date.now();
    const recent = window.filter(t => now - t < 60000);
    const highFreq = recent.length > 100;
    const highVol  = events.length > 1000;

    return {
      blocked,
      highFreq,
      highVol,
      recentCount: recent.length,
      totalEvents: events.length,
      abusive: blocked || highFreq || highVol
    };
  }

  ban(id, reason) {
    this.blacklist.add(id);
    return { banned: id, reason, time: Date.now() };
  }

  unban(id) { this.blacklist.delete(id); }

  stats() {
    return { events: this.events.length, blacklist: [...this.blacklist] };
  }
}

module.exports = new AbuseMonitor();
