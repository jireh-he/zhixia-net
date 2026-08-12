// v0.6.0 Transport — TCP socket 层
const net = require('net');

class Transport {
  constructor() { this.server = null; this.peers = new Map(); }

  listen(port, handler) {
    this.server = net.createServer(socket => {
      this.peers.set(socket.remoteAddress + ':' + socket.remotePort, socket);
      handler(socket);
    });
    this.server.listen(port);
    return this.server;
  }

  connect(host, port) {
    return new Promise((resolve, reject) => {
      const socket = net.connect(port, host, () => resolve(socket));
      socket.on('error', reject);
    });
  }

  close() {
    if (this.server) { this.server.close(); this.server = null; }
  }
}

module.exports = new Transport();
