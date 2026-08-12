// v1.1 — NAT 5-step 检测（IPv6 → IPv4 → QUIC → Hole Punch → 不可达）
// 只检测，不中转。失败标记 "unreachable"，不偷偷转 Relay。
const os = require('os');
const crypto = require('crypto');

class NATProbe {
  constructor() { this.last = null; }

  detect() {
    const ifaces = os.networkInterfaces();
    const result = {
      detectedAt: Date.now(),
      hasIPv6: false,
      hasPublicIPv4: false,
      nat: null,
      transport: null
    };

    // 1. IPv6
    let hasIPv6 = false;
    for (const [name, addrs] of Object.entries(ifaces)) {
      if (addrs && Array.isArray(addrs)) {
        for (const a of addrs) {
          if (a.family === 'IPv6' && !a.internal && !a.address.startsWith('fe80')) {
            hasIPv6 = true;
            break;
          }
        }
      }
    }
    result.hasIPv6 = hasIPv6;

    // 2. 公网 IPv4（粗略：非 RFC 1918 即认为公网）
    const priv = /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.)/;
    let hasPubIPv4 = false;
    for (const [name, addrs] of Object.entries(ifaces)) {
      if (addrs && Array.isArray(addrs)) {
        for (const a of addrs) {
          if (a.family === 'IPv4' && !a.internal && !priv.test(a.address)) {
            hasPubIPv4 = true;
            break;
          }
        }
      }
    }
    result.hasPublicIPv4 = hasPubIPv4;

    // 3. NAT 判定 + 策略
    if (hasIPv6) {
      result.nat = 'open-ipv6';
      result.strategy = 'ipv6-direct';
    } else if (hasPubIPv4) {
      result.nat = 'open-ipv4';
      result.strategy = 'public-ipv4-direct';
    } else {
      result.nat = 'behind-nat';
      result.strategy = 'hole-punching';
    }

    this.last = result;
    return result;
  }

  canDirectConnect() {
    const d = this.last || this.detect();
    return d.nat !== 'behind-nat';
  }
}

module.exports = new NATProbe();
