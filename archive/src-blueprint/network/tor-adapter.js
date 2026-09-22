// Tor 适配器 — 可选 Transport（非 Zhixia Relay）
// 当 Tor 可用时，通过 Tor SOCKS5 proxy 建立连接。
// 当 Tor 不可用时，返回 { available: false }，不做连接尝试。

const { spawn } = require('child_process');
const fs = require('fs');

class TorAdapter {
  constructor() {
    this._process = null;
    this._socksPort = 9050;
    this._available = false;
    this._checkOnce = false;
  }

  /** 检查 Tor 是否可用 */
  check() {
    if (this._checkOnce) return this._available;
    this._checkOnce = true;

    // 1. 检查 SOCKS5 端口是否已有 Tor
    try {
      const net = require('net');
      const s = net.createConnection(this._socksPort, '127.0.0.1');
      s.setTimeout(1000);
      s.on('connect', () => { this._available = true; s.end(); return this._available; });
      s.on('error', () => {});
      s.on('timeout', () => s.destroy());
    } catch (e) {}

    // 2. 检查 tor 二进制
    try {
      const { execSync } = require('child_process');
      const ver = execSync('tor --version 2>/dev/null || true').toString();
      if (ver && !ver.startsWith('\n')) {
        this._available = true;
        return this._available;
      }
    } catch (e) {}

    // 3. 尝试发现可执行路径
    const torPaths = ['/usr/bin/tor', '/usr/local/bin/tor', process.env.TOR_HOME ? `${process.env.TOR_HOME}/tor` : null].filter(Boolean);
    for (const p of torPaths) {
      if (fs.existsSync(p)) { this._available = true; return this._available; }
    }

    this._available = false;
    return false;
  }

  get socksAddr() {
    return `socks5://127.0.0.1:${this._socksPort}`;
  }

  /** 通过 Tor SOCKS5 建立 TCP 连接（需要 socks-proxy-agent） */
  connect(host, port) {
    if (!this._available) {
      return Promise.reject(new Error('tor-unavailable'));
    }

    // 尝试使用 socks-proxy-agent（如果装过）
    let SocksProxyAgent;
    try { SocksProxyAgent = require('socks-proxy-agent').SocksProxyAgent; } catch (e) {
      try { SocksProxyAgent = require('socks-proxy-agent'); } catch (e2) {
        return Promise.reject(new Error('socks-proxy-agent-not-installed'));
      }
    }

    const proxy = new SocksProxyAgent(`socks5://127.0.0.1:${this._socksPort}`);
    return new Promise((resolve, reject) => {
      const req = proxy.connect({ host, port }, (err, stream) => {
        if (err) reject(err);
        else resolve(stream);
      });
      req.on('error', reject);
    });
  }

  status() {
    this.check();
    return {
      available: this._available,
      socksAddr: this.socksAddr,
      note: this._available ? 'optional-transport (not relay)' : 'tor-not-installed — will be skipped'
    };
  }
}

module.exports = new TorAdapter();
