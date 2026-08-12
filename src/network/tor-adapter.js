// Phase 12 — Tor 适配接口（可选插件，不强制依赖）
class TorAdapter {
  constructor() { this.enabled = false; this.socksProxy = '127.0.0.1:9050'; }

  enable() { this.enabled = true; return { ok: true, proxy: this.socksProxy }; }
  disable() { this.enabled = false; return { ok: true }; }

  status() {
    return {
      enabled: this.enabled,
      proxy: this.socksProxy,
      protocol: 'SOCKS5',
      mode: this.enabled ? 'transparent' : 'off'
    };
  }

  // 返回可通过 Tor 的代理地址
  getProxy() { return this.enabled ? this.socksProxy : null; }
}

module.exports = new TorAdapter();
