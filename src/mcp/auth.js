class MCPAuth {
  constructor() { this.sessions = new Map(); }
  register(session) { this.sessions.set(session.id, session); }
  verify(id) { return this.sessions.has(id); }
}

module.exports = new MCPAuth();
