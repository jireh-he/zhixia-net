// v1.1 — Bootstrap（discovery only，不转消息）
// 职责：新节点 startup → GET_PEERS → 拿几个 peer 地址 → 直连 → 逐渐脱离
// 不进入：消息路径、文件路径、Agent 路径、Storage 路径
class Bootstrap {
  constructor() {
    this.peers = new Map();
    this.server = null;
  }

  // 注册 peer（bootstrap 只记录地址，不落盘业务数据）
  register(id, addresses) {
    this.peers.set(id, { addresses, registeredAt: Date.now() });
    return true;
  }

  // 新节点问："给我几个 peer"
  getPeers() {
    const out = [];
    for (const [id, p] of this.peers) {
      out.push({ id, addresses: p.addresses });
    }
    return { peers: out };
  }

  // 启动 discovery 服务（纯 GET_PEERS，不落盘）
  listen(port, handler) {
    const http = require('http');
    this.server = http.createServer((req, res) => {
      if (req.url === '/peers') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.getPeers()));
      } else if (req.url === '/register' && req.method === 'POST') {
        let body = '';
        req.on('data', d => body += d);
        req.on('end', () => {
          try {
            const { id, addresses } = JSON.parse(body);
            this.register(id, addresses);
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
          } catch (e) {
            res.writeHead(400);
            res.end(JSON.stringify({ ok: false, error: 'bad json' }));
          }
        });
      } else {
        res.writeHead(404);
        res.end('');
      }
    });
    this.server.listen(port, '0.0.0.0');
    return this.server;
  }

  close() {
    if (this.server) { this.server.close(); this.server = null; }
  }
}

module.exports = new Bootstrap();
