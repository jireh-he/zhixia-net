// node/monitor.js — 资源监控
class Monitor {
  collect() {
    return {
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      pid: process.pid,
      platform: process.platform,
      time: Date.now()
    };
  }
}

module.exports = new Monitor();
