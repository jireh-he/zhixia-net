// v1.2 — Connection Strategy（三模式：FullCone/Restrict/Symmetric）
// 参考 PyPunchP2P：根据 NAT 类型自动选择连接策略
// FullCone: 直连
// Restrict: 定期打洞
// Symmetric: bootstrap 中转

const net = require('net');
const natProbe = require('./nat-probe');
const holePunch = require('./hole-punch');
const tor = require('./tor-adapter');

class ConnectionStrategy {
  constructor() { this.log = []; }

  _log(step, detail) {
    this.log.push({ step, ...detail, ts: Date.now() });
  }

  // 选择连接策略
  select(ourNat, theirAddresses) {
    const nat = ourNat || natProbe.getNatType();
    const hasIPv6 = theirAddresses.some(a => a.startsWith('/ip6/'));
    const hasIPv4 = theirAddresses.some(a => a.startsWith('/ip4/'));

    // 1. IPv6 直连（最快）
    if (nat === 'open-ipv6' && hasIPv6) return 'ipv6-direct';

    // 2. 公网 IPv4 直连
    if (nat === 'open-ipv4' && hasIPv4) return 'public-ipv4-direct';

    // 3. 根据 NAT 类型选择
    switch (nat) {
      case 'fullcone-direct':
      case 'fullcone':
        return 'fullcone-punch';
      case 'restrict-punching':
      case 'restrict':
      case 'restrictportnat':
        return 'restrict-punch';
      case 'symmetric-nat':
      case 'symmetricudpfirewall':
      case 'bootstrap-relay':
        return 'bootstrap-relay';
      case 'behind-nat':
        // 未知 NAT 类型，先试打洞
        return 'hole-punch';
      default:
        return 'bootstrap-relay';
    }
  }

  // IPv6 直连
  async tryIPv6(peerId, address, timeoutMs = 5000) {
    this._log('try-ipv6', { peerId, address });
    return new Promise((resolve) => {
      const m = address.match(/\/ip6\/([^/]+)\/tcp\/(\d+)/);
      if (!m) { resolve({ ok: false, error: 'invalid-address' }); return; }
      const s = net.createConnection({ host: m[1], port: parseInt(m[2]) }, () => {
        this._log('ipv6-connected', { peerId });
        resolve({ ok: true, strategy: 'ipv6-direct', socket: s });
      });
      s.setTimeout(timeoutMs);
      s.on('error', () => resolve({ ok: false }));
      s.on('timeout', () => { s.destroy(); resolve({ ok: false }); });
    });
  }

  // 公网 IPv4 直连
  async tryPublicIPv4(peerId, address, timeoutMs = 5000) {
    this._log('try-public-ipv4', { peerId, address });
    return new Promise((resolve) => {
      const m = address.match(/\/ip4\/([^/]+)\/tcp\/(\d+)/);
      if (!m) { resolve({ ok: false, error: 'invalid-address' }); return; }
      const s = net.createConnection(parseInt(m[2]), m[1], () => {
        this._log('ipv4-connected', { peerId });
        resolve({ ok: true, strategy: 'public-ipv4-direct', socket: s });
      });
      s.setTimeout(timeoutMs);
      s.on('error', () => resolve({ ok: false }));
      s.on('timeout', () => { s.destroy(); resolve({ ok: false }); });
    });
  }

  // FullCone NAT: 单向打洞即可
  async tryFullConePunch(peerId, theirAddress, myId) {
    this._log('try-fullcone-punch', { peerId, theirAddress });
    const parsed = holePunch._parseAddr(theirAddress);
    if (!parsed) return { ok: false, error: 'invalid-address' };

    // 确保 hole-punch socket 已监听
    if (!holePunch.socket) {
      const { port } = await holePunch.listen(0);
    }

    const result = await holePunch.punchOnce(
      parsed.host, parsed.port, myId, peerId, 4000
    );

    if (result.ok) {
      this._log('fullcone-connected', { peerId, myPort: result.myPort });
    } else {
      this._log('fullcone-failed', { peerId, error: result.error });
    }
    return {
      ok: result.ok,
      strategy: 'fullcone-punch',
      socket: null, // UDP socket，不直接用于 TCP 消息
      myPort: result.myPort,
      targetAddr: result.targetAddr,
      targetPort: result.targetPort
    };
  }

  // Restrict NAT: 定期打洞
  async tryRestrictPunch(peerId, theirAddress, myId) {
    this._log('try-restrict-punch', { peerId, theirAddress });
    const parsed = holePunch._parseAddr(theirAddress);
    if (!parsed) return { ok: false, error: 'invalid-address' };

    if (!holePunch.socket) {
      const { port } = await holePunch.listen(0);
    }

    const result = await holePunch.punchPeriodic(
      parsed.host, parsed.port, myId, peerId, 500, 10
    );

    if (result.ok) {
      this._log('restrict-connected', { peerId, myPort: result.myPort, attempts: result.attempts });
    } else {
      this._log('restrict-failed', { peerId, error: result.error, attempts: result.attempts });
    }
    return {
      ok: result.ok,
      strategy: 'restrict-punch',
      socket: null,
      myPort: result.myPort,
      targetAddr: result.targetAddr,
      targetPort: result.targetPort
    };
  }

  // Tor（可选）
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

  // 主入口
  async connect(peerId, theirAddresses, opts = {}) {
    const ourNat = opts.nat || natProbe.getNatType();
    const myId = opts.myId || 'zid:local';
    const strategy = this.select(ourNat, theirAddresses);
    this._log('selected-strategy', { peerId, strategy, nat: ourNat });

    switch (strategy) {
      case 'ipv6-direct': {
        const ip6 = theirAddresses.find(a => a.startsWith('/ip6/'));
        if (ip6) return this.tryIPv6(peerId, ip6);
        return { ok: false, strategy, error: 'no-ipv6-address' };
      }

      case 'public-ipv4-direct': {
        const ip4 = theirAddresses.find(a => a.startsWith('/ip4/'));
        if (ip4) return this.tryPublicIPv4(peerId, ip4);
        return { ok: false, strategy, error: 'no-ipv4-address' };
      }

      case 'fullcone-punch': {
        const ip4 = theirAddresses.find(a => a.startsWith('/ip4/'));
        if (!ip4) return { ok: false, strategy, error: 'no-ipv4-address' };
        return this.tryFullConePunch(peerId, ip4, myId);
      }

      case 'restrict-punch': {
        const ip4 = theirAddresses.find(a => a.startsWith('/ip4/'));
        if (!ip4) return { ok: false, strategy, error: 'no-ipv4-address' };
        return this.tryRestrictPunch(peerId, ip4, myId);
      }

      case 'hole-punch': {
        // 未知 NAT 类型：先试 FullCone，再试 Restrict
        const ip4 = theirAddresses.find(a => a.startsWith('/ip4/'));
        if (!ip4) return { ok: false, strategy, error: 'no-ipv4-address' };
        const fc = await this.tryFullConePunch(peerId, ip4, myId);
        if (fc.ok) return fc;
        return this.tryRestrictPunch(peerId, ip4, myId);
      }

      case 'bootstrap-relay':
        return { ok: false, strategy: 'bootstrap-relay', reason: 'symmetric-nat' };

      case 'tor': {
        const ip4 = theirAddresses.find(a => a.startsWith('/ip4/'));
        if (!ip4) return { ok: false, strategy: 'tor', error: 'no-ipv4-address' };
        const m = ip4.match(/\/ip4\/([^/]+)\/tcp\/(\d+)/);
        return this.tryTor(peerId, m ? m[1] : 'relay', m ? parseInt(m[2]) : 9000);
      }

      default:
        return { ok: false, strategy: 'unreachable' };
    }
  }
}

module.exports = new ConnectionStrategy();
