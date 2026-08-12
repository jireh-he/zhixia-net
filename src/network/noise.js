// v0.6.1 Noise session registry
class Noise {
  constructor() { this.sessions = new Map(); }
  create(peer, key) { this.sessions.set(peer, { key, created: Date.now() }); }
  get(peer)         { return this.sessions.get(peer); }
  remove(peer)      { return this.sessions.delete(peer); }
  list()            { return [...this.sessions.keys()]; }
}

module.exports = new Noise();
