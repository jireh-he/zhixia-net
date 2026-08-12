// Phase 12 — STUN 检测（同步版，第一版不需要真实 UDP）
class STUN {
  constructor() {
    this.servers = ['stun.l.google.com:19302', 'stun1.l.google.com:19302'];
    this.lastDetect = null;
  }

  detect() {
    if (this.lastDetect) return this.lastDetect;
    const result = {
      publicIP: null,
      publicPort: null,
      natType: 'unknown',
      detectedAt: Date.now()
    };
    if (process.env.ZHIXIA_STUN_TYPE) {
      result.natType = process.env.ZHIXIA_STUN_TYPE;
      result.publicIP = process.env.ZHIXIA_STUN_IP || null;
    }
    this.lastDetect = result;
    return result;
  }

  setPublicInfo(ip, port) {
    this.lastDetect = { publicIP: ip, publicPort: port, natType: 'open', detectedAt: Date.now() };
    return this.lastDetect;
  }

  canDirectConnect() {
    return this.lastDetect && (this.lastDetect.natType === 'open' || this.lastDetect.natType === 'restricted');
  }
}

module.exports = new STUN();
