// Connection Strategy — 三级：IPv6 Direct → NAT Hole Punch → Tor
// 无 Relay。Tor 是可选 Transport，不做转发。
const natProbe = require('./nat-probe');
const holePunch = require('./hole-punch');
const tor = require('./tor-adapter');
const net = require('net');
const dgram = require('dgram');

class ConnectionStrategy {
  constructor() { this.log = []; }

  _log(step, detail) {
    this.log.push({ step, ...detail, ts: Date.now() });
  }

  /** 选策略 */
  select(ourNat, theirAddresses) {
    const hasIPv6 = theirAddresses.some(a => a.startsWith('/ip6/'));
    const hasIPv4 = theirAddresses.some(a => a.startsWith('/ip4/'));

    // 第一优先：IPv6 直连
    if (ourNat.nat === 'open-ipv6' && hasIPv6) return 'ipv6-direct';
    // 第二优先：公网 IPv4 直连
    if (ourNat.nat === 'open-ipv4' && hasIPv4) return 'public-ipv4-direct';
    // 第三优先：NAT 打洞
    if (ourNat.strategy === 'hole-punching' || hasIPv4) return 'hole-punching';
    // 最后备用：Tor
    if (tor.check()) return 'tor';
    return 'unreachable';
  }

  /** 尝试 IPv6 直连 */
  async tryIPv6(peerId, address, timeoutMs = 5000) {
    this._log('try-ipv6', { peerId, address });
    return new Promise((resolve) => {
      const s = net.createConnection({ host: address, port: 9001 }, () => {
        this._log('ipv6-connected', { peerId });
        resolve({ ok: true, strategy: 'ipv6-direct', socket: s });
      });
      s.setTimeout(timeoutMs);
      s.on('error', () => resolve({ ok: false }));
      s.on('timeout', () => { s.destroy(); resolve({ ok: false }); });
    });
  }

  /** 尝试 UDP/QUIC 打洞（模拟：UDP 端口对打） */
  async tryHolePunch(peerId, theirAddr, theirPort, myPort) {
    this._log('try-hole-punch', { peerId, theirAddr, theirPort });
    return new Promise((resolve) => {
      const socket = dgram.createSocket('udp4');
      socket.bind(myPort || 0);
      socket.on('error', () => resolve({ ok: false }));

      socket.on('message', (data) => {
        this._log('punch-hit', { peerId, from: data.toString().slice(0, 40) });
        socket.close();
        resolve({ ok: true, strategy: 'hole-punching', punchPort: socket.address().port });
      });

      // 双向打洞：持续发送探测
      const t = setInterval(() => {
        socket.send(
          JSON.stringify({ type: 'punch', from: 'this-node' }),
          theirPort,
          theirAddr
        );
      }, 500);

      socket.setTimeout(4000);
      socket.on('timeout', () => {
        clearInterval(t);
        socket.close();
        resolve({ ok: false });
      });
    });
  }

  /** 尝试 Tor（可选 Transport） */
  async tryTor(peerId, address, port) {
    if (!tor.check()) {
      this._log('tor-skipped', { reason: 'not-installed' });
      return { ok: false, strategy: 'tor' };
    }
    this._log('try-tor', { peerId, address });
    try {
      const s = await tor.connect(address, port);
      this._log('tor-connected', { peerId });
      return { ok: true, strategy: 'tor', socket: s };
    } catch (e) {
      this._log('tor-failed', { peerId, err: e.message });
      return { ok: false, strategy: 'tor' };
    }
  }

  /** 尝试公网 IPv4 直连 */
  async tryPublicIPv4(peerId, address, port, timeoutMs = 5000) {
    this._log('try-public-ipv4', { peerId, address, port });
    return new Promise((resolve) => {
      const s = net.createConnection(port, address, () => {
        this._log('ipv4-connected', { peerId });
        resolve({ ok: true, strategy: 'public-ipv4-direct', socket: s });
      });
      s.setTimeout(timeoutMs);
      s.on('error', () => resolve({ ok: false }));
      s.on('timeout', () => { s.destroy(); resolve({ ok: false }); });
    });
  }

  /** 主入口：三级策略 */
  async connect(peerId, theirAddresses, ourNat) {
    const strategy = this.select(ourNat || natProbe.last || natProbe.detect(), theirAddresses);
    this._log('selected-strategy', { peerId, strategy });

    if (strategy === 'ipv6-direct') {
      return this.tryIPv6(peerId, theirAddresses[0]);
    }
    if (strategy === 'public-ipv4-direct') {
      const ip4 = theirAddresses.find(a => a.startsWith('/ip4/'));
      const [_, host, port] = ip4.match(/\/ip4\/([^\/]+)\/tcp\/(\d+)/) || [];
      return this.tryPublicIPv4(peerId, host, parseInt(port, 10) || 9000);
    }
    if (strategy === 'hole-punching') {
      const ip4 = theirAddresses.find(a => a.startsWith('/ip4/'));
      if (!ip4) return { ok: false, strategy };
      const [_, host, port] = ip4.match(/\/ip4\/([^\/]+)\/tcp\/(\d+)/) || [];
      return this.tryHolePunch(peerId, host, parseInt(port, 10) || 9000, 0);
    }
    if (strategy === 'tor') {
      const ip4 = theirAddresses.find(a => a.startsWith('/ip4/'));
      const [_, host, port] = ip4.match(/\/ip4\/([^\/]+)\/tcp\/(\d+)/) || [];
      return this.tryTor(peerId, host || 'relay', parseInt(port, 10) || 9000);
    }
    return { ok: false, strategy: 'unreachable' };
  }
}

module.exports = new ConnectionStrategy();
