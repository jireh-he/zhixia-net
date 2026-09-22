// v0.6.0 Network Protocol — 统一帧格式
class NetworkProtocol {
  encode(type, data, id) {
    return { version: '1.0', type, id: id || 'pkt:' + Date.now(), data, time: Date.now() };
  }
  decode(packet) { return packet; }
}

module.exports = new NetworkProtocol();
