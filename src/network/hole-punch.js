// v1.1 — UDP Hole Punching（无 Relay）
// 两个 NAT 后的节点互相打洞，打通后直接通信。
// 失败标记 "unreachable"，绝不用 Relay。
const dgram = require('dgram');
const os = require('os');

class HolePunch {
  constructor() { this.socket = null; this.pending = new Map(); }

  listen(port) {
    return new Promise((resolve) => {
      this.socket = dgram.createSocket('udp4');
      this.socket.on('listening', () => resolve({ port: this.socket.address().port }));
      this.socket.bind(port || 0);
    });
  }

  // 向目标地址探测并打洞
  punch(targetAddr, targetPort, myId, peerId) {
    if (!this.socket) return null;
    const payload = Buffer.from(JSON.stringify({
      type: 'holepunch', from: myId, to: peerId, ts: Date.now()
    }));
    this.socket.send(payload, targetPort, targetAddr);
    return { targetAddr, targetPort };
  }

  onMessage(handler) {
    if (this.socket) {
      this.socket.on('message', (data, rinfo) => {
        try {
          handler(JSON.parse(data.toString()), rinfo);
        } catch (_) {}
      });
    }
  }

  close() {
    if (this.socket) { this.socket.close(); this.socket = null; }
  }
}

module.exports = new HolePunch();
