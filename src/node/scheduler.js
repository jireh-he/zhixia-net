// node/scheduler.js — 周期任务调度
class Scheduler {
  constructor() { this.jobs = []; this.intervals = []; }

  add(name, interval, handler) {
    this.jobs.push({ name, interval, handler });
  }

  start() {
    for (const job of this.jobs) {
      const id = setInterval(job.handler, job.interval);
      this.intervals.push(id);
    }
    return this.intervals.length;
  }

  stop() {
    for (const id of this.intervals) clearInterval(id);
    this.intervals = [];
  }
}

module.exports = new Scheduler();
