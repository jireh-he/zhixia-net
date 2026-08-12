const crypto = require('crypto');

class MCPSession {
  create(agent) {
    return {
      id: 'mcp:' + crypto.randomBytes(8).toString('hex'),
      agent,
      createdAt: Date.now()
    };
  }
}

module.exports = new MCPSession();
