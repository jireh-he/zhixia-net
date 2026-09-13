// v1.2 — Message（直连 + Bootstrap Relay 兜底）
// Agent → Skill Runtime → message.send → PeerManager → connectionStrategy → Direct/Relay → B
// 直连失败时自动走 bootstrap /relay/send + /relay/poll 兜底
const peerManager = require('./peer-manager');
const peerTable = require('./peer-table');
const http = require('http');

class MessageManager {
  constructor() {
    this.handlers = new Map();
    this.sent = 0;
    this.bootstrapUrl = null;  // bootstrap 服务器地址
  }

  on(type, handler) { this.handlers.set(type, handler); }

  setBootstrap(url) { this.bootstrapUrl = url; }

  // 走 bootstrap relay 中转
  async _relaySend(from, to, payload) {
    if (!this.bootstrapUrl) {
      return { ok: false, error: 'no-bootstrap-url', to };
    }

    const url = new URL('/relay/send', this.bootstrapUrl);
    const body = JSON.stringify({ from, to, payload });

    return new Promise((resolve) => {
      const req = http.request({
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      }, (res) => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { resolve({ ok: false, error: 'bad-response' }); }
        });
      });
      req.on('error', () => resolve({ ok: false, error: 'bootstrap-unreachable' }));
      req.setTimeout(5000, () => { req.destroy(); resolve({ ok: false, error: 'bootstrap-timeout' }); });
      req.write(body);
      req.end();
    });
  }

  // 轮询 bootstrap 取回中转消息
  async pollMessages(id) {
    if (!this.bootstrapUrl) return [];

    const url = new URL('/relay/poll', this.bootstrapUrl);
    const body = JSON.stringify({ id });

    const resp = await new Promise((resolve) => {
      const req = http.request({
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      }, (res) => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { resolve(null); }
        });
      });
      req.on('error', () => resolve(null));
      req.setTimeout(5000, () => { req.destroy(); resolve(null); });
      req.write(body);
      req.end();
    });

    if (resp && resp.ok && resp.messages) {
      return resp.messages;
    }
    return [];
  }

  async send(from, to, payload) {
    // 1. 检查是否已直连
    const direct = peerManager.findDirect(to);
    if (direct) {
      const msg = {
        type: 'msg',
        from,
        to,
        payload,
        ts: Date.now(),
        nonce: this.sent++
      };
      this.handlers.get('outbound')?.(msg);
      return { ok: true, to, type: msg.type, nonce: msg.nonce, via: 'direct' };
    }

    // 2. 未直连 → 尝试建立直连（真调 connectionStrategy）
    const peerEntry = peerTable.get(to);
    if (peerEntry && peerEntry.addresses) {
      const result = await peerManager.connectTo(to, peerEntry.addresses);
      if (result.ok) {
        const msg = {
          type: 'msg',
          from,
          to,
          payload,
          ts: Date.now(),
          nonce: this.sent++
        };
        this.handlers.get('outbound')?.(msg);
        return { ok: true, to, type: msg.type, nonce: msg.nonce, via: 'direct-new' };
      }
    }

    // 3. 直连失败 → bootstrap relay 兜底
    const relayResult = await this._relaySend(from, to, payload);
    if (relayResult.ok) {
      this.sent++;
      return { ok: true, to, via: 'bootstrap-relay', queued: relayResult.queued };
    }

    // 4. 全部失败
    return { error: 'no-direct-and-relay-failed', to, relayError: relayResult.error };
  }

  receive(msg) {
    this.handlers.get('inbound')?.(msg);
    this.handlers.get(msg.type)?.(msg);
    return { ok: true, from: msg.from };
  }

  status() {
    return { handlers: [...this.handlers.keys()], sent: this.sent, bootstrapUrl: this.bootstrapUrl };
  }
}

module.exports = new MessageManager();