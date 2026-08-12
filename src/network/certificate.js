// v0.6.1 Certificate
class Certificate {
  create(identity) {
    return {
      nodeId: identity.id,
      publicKey: identity.publicKey,
      capabilities: identity.capabilities || [],
      created: Date.now()
    };
  }
  verify(cert) {
    return !!(cert.nodeId && cert.publicKey);
  }
}

module.exports = new Certificate();
