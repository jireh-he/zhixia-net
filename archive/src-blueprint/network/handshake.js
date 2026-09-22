// v0.6.0 Handshake — 身份握手
class Handshake {
  create(identity) {
    return {
      type: 'handshake',
      nodeId: identity.nodeId || identity.id,
      publicKey: identity.publicKey,
      capabilities: identity.capabilities || [],
      time: Date.now()
    };
  }
  verify(message) {
    return !!(message.nodeId && message.publicKey);
  }
}

module.exports = new Handshake();
