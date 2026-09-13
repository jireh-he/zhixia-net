// v1.2 — NAT 检测（本地探测 + STUN 检测）
// 1. 本地探测：IPv6/IPv4/NAT 判断
// 2. STUN 探测：NAT 类型（FullCone/Restrict/Symmetric）
const os = require('os');
const stun = require('./stun');

class NATProbe {
  constructor() { this.last = null; this.stunResult = null; }

  detect() {
    const ifaces = os.networkInterfaces();
    const result = {
      detectedAt: Date.now(),
      hasIPv6: false,
      hasPublicIPv4: false,
      nat: null,
      strategy: null
    };

    // 1. IPv6
    for (const [name, addrs] of Object.entries(ifaces)) {
      if (addrs && Array.isArray(addrs)) {
        for (const a of addrs) {
          if (a.family === 'IPv6' && !a.internal && !a.address.startsWith('fe80')) {
            result.hasIPv6 = true; break;
          }
        }
      }
    }

    // 2. 公网 IPv4
    const priv = /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.)/;
    for (const [name, addrs] of Object.entries(ifaces)) {
      if (addrs && Array.isArray(addrs)) {
        for (const a of addrs) {
          if (a.family === 'IPv4' && !a.internal && !priv.test(a.address)) {
            result.hasPublicIPv4 = true; break;
          }
        }
      }
    }

    // 3. NAT 判定 + 策略
    if (result.hasIPv6) {
      result.nat = 'open-ipv6';
      result.strategy = 'ipv6-direct';
    } else if (result.hasPublicIPv4) {
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

  // STUN 检测 NAT 类型（异步，需要网络）
  async detectWithSTUN(opts = {}) {
    const local = this.detect();
    try {
      // 加 8s 超时，网络不通时快速 fallback
      const stunResult = await Promise.race([
        stun.detect(opts),
        new Promise((_, reject) => setTimeout(() => reject(new Error('stun-timeout')), 8000))
      ]);
      this.stunResult = stunResult;
      // 如果本地检测是 behind-nat，用 STUN 结果细化
      if (local.nat === 'behind-nat' && stunResult.nat) {
        local.nat = stunResult.nat.toLowerCase().replace(/[^a-z]/g, '-');
        local.externalIP = stunResult.externalIP;
        local.externalPort = stunResult.externalPort;
        // 根据 NAT 类型选择策略
        switch (stunResult.nat) {
          case 'FullCone':
            local.strategy = 'fullcone-direct'; break;
          case 'RestrictNAT':
          case 'RestrictPortNAT':
            local.strategy = 'restrict-punching'; break;
          case 'SymmetricNAT':
          case 'SymmetricUDPFirewall':
            local.strategy = 'bootstrap-relay'; break;
          default:
            local.strategy = 'bootstrap-relay'; break;
        }
      }
    } catch (e) {
      // STUN 检测失败，用本地检测结果
      local.stunError = e.message;
    }
    this.last = local;
    return local;
  }

  // 获取 NAT 类型（同步，从缓存）
  getNatType() {
    if (this.stunResult) return this.stunResult.nat;
    if (this.last) return this.last.nat;
    return this.detect().nat;
  }
}

module.exports = new NATProbe();
