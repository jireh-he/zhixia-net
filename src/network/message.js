// v1.1 — Message（无 Relay，A ↔ B 直连）
// Agent → Skill Runtime → message.send → Peer Manager → Direct Connection → B
// 如果 A ↔ B 无直连：Peer Table → 寻找可达路径 → 建立直连
// 绝不做 A → C → B（C 只帮 A 发现 B，不转发业务流）
const peerManager = require('./peer-manager');

class MessageManager {
  constructor() { this.handlers = new Map(); this.sent = 0; }

  on(type, handler) { this.handlers.set(type, handler); }

  async send(from, to, payload) {
    // 1. 检查是否直连
    const direct = peerManager.findDirect(to);
    if (!direct) {
      // 2. 没有直连：找可达路径（从 peer exchange 找中间 peer 帮发现）
      // 发现之后建立直连，绝不让中间节点转发业务流
      return { error: 'no-direct-path', to };
    }

    const msg = {
      type: 'msg',
      from,
      to,
      payload,
      ts: Date.now(),
      nonce: this.sent++
    };

    this.handlers.get('outbound')?.(msg);
    return { ok: true, to, type: msg.type, nonce: msg.nonce };
  }

  receive(msg) {
    this.handlers.get('inbound')?.(msg);
    this.handlers.get(msg.type)?.(msg);
    return { ok: true, from: msg.from };
  }

  status() {
    return { handlers: [...this.handlers.keys()], sent: this.sent };
  }
}

module.exports = new MessageManager();
