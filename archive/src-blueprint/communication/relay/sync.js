// Communication: Relay Sync — 离线消息同步协议
// 用户上线后请求拉取加密消息，网络只传输密文

class RelaySync {
  request(userId) {
    return {
      type: 'message.sync.request',
      userId,
      timestamp: Date.now()
    };
  }

  response(messages) {
    return {
      type: 'message.sync.response',
      messages,
      timestamp: Date.now()
    };
  }
}

module.exports = new RelaySync();