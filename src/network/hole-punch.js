// v1.2 — UDP Hole Punching（参考 PyPunchP2P）
// FullCone: 单向探测即可
// Restrict: 定期发包打洞，直到对方响应
// 成功返回 socket + port，失败标记 unreachable
const dgram = require('dgram');

class HolePunch {
  constructor() {
    this.socket = null;
    this.pending = new Map();
    this.periodicTimers = new Map(); // target -> interval
  }

  listen(port) {
    return new Promise((resolve, reject) => {
      this.socket = dgram.createSocket('udp4');
      this.socket.on('error', reject);
      this.socket.on('listening', () => {
        resolve({ port: this.socket.address().port });
      });
      this.socket.bind(port || 0);
    });
  }

  // 解析 multiaddr 格式: /ip4/1.2.3.4/tcp/1234
  _parseAddr(addr) {
    const m = addr.match(/\/ip4\/([^/]+)\/tcp\/(\d+)/);
    return m ? { host: m[1], port: parseInt(m[2]) } : null;
  }

  // FullCone 模式：发一次探测，等待响应
  punchOnce(targetAddr, targetPort, myId, peerId, timeout = 4000) {
    return new Promise((resolve) => {
      if (!this.socket) { resolve({ ok: false, error: 'not-listening' }); return; }

      const payload = JSON.stringify({
        type: 'punch', from: myId, to: peerId, ts: Date.now()
      });

      const timer = setTimeout(() => {
        this.socket.removeListener('message', onMessage);
        resolve({ ok: false, error: 'timeout' });
      }, timeout);

      const onMessage = (data, rinfo) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'punch' || msg.type === 'punch-ack') {
            clearTimeout(timer);
            this.socket.removeListener('message', onMessage);
            resolve({
              ok: true,
              strategy: 'fullcone-direct',
              targetAddr: rinfo.address,
              targetPort: rinfo.port,
              myPort: this.socket.address().port
            });
          }
        } catch (e) {}
      };

      this.socket.on('message', onMessage);
      this.socket.send(payload, targetPort, targetAddr);
    });
  }

  // Restrict NAT 模式：定期发包打洞
  // 返回 Promise，打洞成功后 resolve
  punchPeriodic(targetAddr, targetPort, myId, peerId, interval = 500, maxAttempts = 10) {
    return new Promise((resolve) => {
      if (!this.socket) { resolve({ ok: false, error: 'not-listening' }); return; }

      let attempts = 0;
      let resolved = false;

      const onMessage = (data, rinfo) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'punch' || msg.type === 'punch-ack') {
            if (!resolved) {
              resolved = true;
              clearInterval(timer);
              this.periodicTimers.delete(targetAddr);
              this.socket.removeListener('message', onMessage);
              resolve({
                ok: true,
                strategy: 'restrict-punching',
                targetAddr: rinfo.address,
                targetPort: rinfo.port,
                myPort: this.socket.address().port,
                attempts
              });
            }
          }
        } catch (e) {}
      };

      this.socket.on('message', onMessage);

      const payload = JSON.stringify({
        type: 'punch', from: myId, to: peerId, ts: Date.now()
      });

      const timer = setInterval(() => {
        attempts++;
        this.socket.send(payload, targetPort, targetAddr);
        if (attempts >= maxAttempts && !resolved) {
          resolved = true;
          clearInterval(timer);
          this.socket.removeListener('message', onMessage);
          resolve({ ok: false, error: 'max-attempts', attempts });
        }
      }, interval);

      this.periodicTimers.set(targetAddr, timer);
    });
  }

  // 统一入口：根据 NAT 类型自动选择策略
  punch(peerId, theirAddress, myId, natType, opts = {}) {
    const parsed = this._parseAddr(theirAddress);
    if (!parsed) return Promise.resolve({ ok: false, error: 'invalid-address' });

    const timeout = opts.timeout || 5000;
    const interval = opts.interval || 500;
    const maxAttempts = opts.maxAttempts || Math.ceil(timeout / interval);

    switch (natType) {
      case 'FullCone':
      case 'fullcone-direct':
        return this.punchOnce(parsed.host, parsed.port, myId, peerId, timeout);

      case 'RestrictNAT':
      case 'RestrictPortNAT':
      case 'restrict-punching':
        return this.punchPeriodic(parsed.host, parsed.port, myId, peerId, interval, maxAttempts);

      case 'SymmetricNAT':
      case 'SymmetricUDPFirewall':
      case 'bootstrap-relay':
        return Promise.resolve({ ok: false, error: 'symmetric-nat', strategy: 'bootstrap-relay' });

      default:
        // 未知 NAT 类型，先试 FullCone，再试 Restrict
        return this.punchOnce(parsed.host, parsed.port, myId, peerId, timeout)
          .then(r => r.ok ? r : this.punchPeriodic(parsed.host, parsed.port, myId, peerId, interval, maxAttempts));
    }
  }

  onMessage(handler) {
    if (this.socket) {
      this.socket.on('message', (data, rinfo) => {
        try { handler(JSON.parse(data.toString()), rinfo); } catch (e) {}
      });
    }
  }

  close() {
    for (const t of this.periodicTimers.values()) clearInterval(t);
    this.periodicTimers.clear();
    if (this.socket) { this.socket.close(); this.socket = null; }
  }
}

module.exports = new HolePunch();
