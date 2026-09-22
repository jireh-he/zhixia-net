// v1.1 — Transport：QUIC 优先，TCP fallback（无 Relay）
// 数据路径永远直接 A ↔ B
const net = require('net');

let QUIC = null;
try { QUIC = require('node:quic'); } catch (_) {
  try { QUIC = require('@node-rs/quic'); } catch (_) { /* no QUIC */ }
}

class Transport {
  constructor() { this.quic = QUIC; this.tcpServer = null; this.peers = new Map(); }

  hasQUIC() { return !!QUIC; }

  // QUIC listener (primary)
  listenQUIC(port, handler) {
    if (!QUIC) return null;
    this.quicServer = new QUIC.Server({ serverName: 'zhixia', handler });
    this.quicServer.listen(port);
    return this.quicServer;
  }

  // TCP fallback listener
  listenTCP(port, handler) {
    this.tcpServer = net.createServer((socket) => {
      const key = socket.remoteAddress + ':' + socket.remotePort;
      this.peers.set(key, socket);
      handler(socket);
      socket.on('end', () => this.peers.delete(key));
      socket.on('error', () => this.peers.delete(key));
    });
    this.tcpServer.listen(port, '0.0.0.0');
    return this.tcpServer;
  }

  connect(host, port, opts = {}) {
    const proto = opts.proto || (this.quic ? 'quic' : 'tcp');
    if (proto === 'quic' && this.quic) {
      // Node native QUIC client
      return Promise.resolve(new QUIC.Client({ peer: `${host}:${port}` }));
    }
    return new Promise((resolve, reject) => {
      const s = net.connect(port, host, () => resolve(s));
      s.on('error', reject);
    });
  }

  close() {
    if (this.quicServer) { this.quicServer.close(); this.quicServer = null; }
    if (this.tcpServer) { this.tcpServer.close(); this.tcpServer = null; }
    this.peers.clear();
  }

  status() {
    return { quic: !!QUIC, tcp: !!this.tcpServer, peers: this.peers.size };
  }
}

module.exports = new Transport();
