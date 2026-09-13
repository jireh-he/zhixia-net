// v1.2 — Bootstrap（discovery + store-and-forward relay）
// 职责：
//   1. 节点发现（GET /peers, POST /register, GET /whoami, POST /heartbeat）
//   2. 消息中转（POST /relay/send, GET /relay/poll）— 直连失败时的兜底
// 设计：一个 HTTP 服务搞定所有，不需要独立 relay 服务器
// 安全：bootstrap 只转发，不解析/不存储消息内容（仅存中转）
const http = require('http');

class Bootstrap {
  constructor() {
    this.peers = new Map();       // zid -> { addresses, registeredAt }
    this.relayMessages = new Map(); // to_zid -> [{ from, payload, ts, acked }]
    this.server = null;
    this.port = null;
  }

  register(id, addresses) {
    this.peers.set(id, { addresses, registeredAt: Date.now() });
    return true;
  }

  getPeers() {
    const out = [];
    for (const [id, p] of this.peers) {
      out.push({ id, addresses: p.addresses });
    }
    return { peers: out };
  }

  // 存储中转消息（POST /relay/send）
  storeMessage(from, to, payload) {
    if (!this.relayMessages.has(to)) {
      this.relayMessages.set(to, []);
    }
    this.relayMessages.get(to).push({
      from, payload, ts: Date.now(), acked: false
    });
    // 清理过期消息（>10分钟）
    this._cleanExpired();
    return true;
  }

  // 轮询取走中转消息（GET /relay/poll）
  pollMessages(id) {
    const msgs = this.relayMessages.get(id) || [];
    if (msgs.length === 0) return [];
    // 返回所有未确认的消息，标记为已确认
    const out = [];
    this.relayMessages.set(id, []);
    for (const m of msgs) {
      out.push({ from: m.from, payload: m.payload, ts: m.ts });
    }
    return out;
  }

  _cleanExpired() {
    const now = Date.now();
    for (const [id, msgs] of this.relayMessages) {
      const fresh = msgs.filter(m => now - m.ts < 600000); // 10分钟
      if (fresh.length === 0) this.relayMessages.delete(id);
      else this.relayMessages.set(id, fresh);
    }
  }

  listen(port, host) {
    this.port = port;
    this.server = http.createServer((req, res) => {
      const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

      // ── 发现端点 ──
      if (req.url === '/peers' && req.method === 'GET') {
        res.writeHead(200, headers);
        res.end(JSON.stringify(this.getPeers()));
      } else if (req.url === '/register' && req.method === 'POST') {
        let body = '';
        req.on('data', d => body += d);
        req.on('end', () => {
          try {
            const { id, addresses } = JSON.parse(body);
            this.register(id, addresses);
            res.writeHead(201, headers);
            res.end(JSON.stringify({ ok: true }));
          } catch (e) {
            res.writeHead(400, headers);
            res.end(JSON.stringify({ ok: false, error: 'bad json' }));
          }
        });
      } else if (req.url === '/whoami' && req.method === 'GET') {
        const clientIp = req.socket.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
        res.writeHead(200, headers);
        res.end(JSON.stringify({ ok: true, publicIp: clientIp, peerCount: this.peers.size }));
      } else if (req.url === '/heartbeat' && req.method === 'POST') {
        let body = '';
        req.on('data', d => body += d);
        req.on('end', () => {
          try {
            const { id } = JSON.parse(body);
            const p = this.peers.get(id);
            if (p) p.registeredAt = Date.now();
            res.writeHead(200, headers);
            res.end(JSON.stringify({ ok: true, known: !!p }));
          } catch (e) {
            res.writeHead(400, headers);
            res.end(JSON.stringify({ ok: false, error: 'bad json' }));
          }
        });
      }
      // ── 中转端点 ──
      else if (req.url === '/relay/send' && req.method === 'POST') {
        let body = '';
        req.on('data', d => body += d);
        req.on('end', () => {
          try {
            const { from, to, payload } = JSON.parse(body);
            if (!to || !from) {
              res.writeHead(400, headers);
              res.end(JSON.stringify({ ok: false, error: 'missing from or to' }));
              return;
            }
            this.storeMessage(from, to, payload);
            res.writeHead(200, headers);
            res.end(JSON.stringify({ ok: true, queued: this.relayMessages.get(to).length }));
          } catch (e) {
            res.writeHead(400, headers);
            res.end(JSON.stringify({ ok: false, error: 'bad json' }));
          }
        });
      } else if (req.url === '/relay/poll' && req.method === 'POST') {
        let body = '';
        req.on('data', d => body += d);
        req.on('end', () => {
          try {
            const { id } = JSON.parse(body);
            const msgs = this.pollMessages(id);
            res.writeHead(200, headers);
            res.end(JSON.stringify({ ok: true, messages: msgs, count: msgs.length }));
          } catch (e) {
            res.writeHead(400, headers);
            res.end(JSON.stringify({ ok: false, error: 'bad json' }));
          }
        });
      }
      else {
        res.writeHead(404, headers);
        res.end(JSON.stringify({ error: 'not found' }));
      }
    });
    this.server.listen(port, host || '0.0.0.0', () => {
      console.log('Bootstrap server listening on port', port);
    });
    // 定期清理过期中转消息
    setInterval(() => this._cleanExpired(), 60000);
    return this.server;
  }

  close() {
    if (this.server) { this.server.close(); this.server = null; }
  }
}

module.exports = new Bootstrap();
