// Communication: Transport — 抽象发送层
// 消息层 → Transport → Daemon → P2P
// 通过 zid 查找在线 peer 的 pubkey，再走 send_json

class MessageTransport {
  constructor() {
    this.sender = null;
    this._lookup = null;
  }

  setSender(sender) {
    this.sender = sender;
  }

  // 注入 zid → pubkey 的查找函数
  setLookup(lookupFn) {
    this._lookup = lookupFn;
  }

  async send(message) {
    const targetZid = message.to;

    if (this.sender && this._lookup) {
      const pubkey = await this._lookup(targetZid);
      if (!pubkey) {
        return { ok: false, err: `User ${targetZid} not connected` };
      }
      try {
        return await this.sender({ type: 'message.send', payload: message, peer_pubkey: pubkey });
      } catch (e) {
        return { ok: false, err: e.message };
      }
    }
    if (this.sender) {
      try {
        return await this.sender({ type: 'message.send', payload: message });
      } catch (e) {
        return { ok: false, err: e.message };
      }
    }
    return { ok: false, err: 'Transport unavailable' };
  }
}

module.exports = new MessageTransport();