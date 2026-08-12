const MCP_VERSION = '2025-01-01';

class MCPProtocol {
  request(method, params) {
    return { jsonrpc: '2.0', id: Date.now(), method, params };
  }
  response(id, result) {
    return { jsonrpc: '2.0', id, result };
  }
}

MCPProtocol.VERSION = MCP_VERSION;
module.exports = new MCPProtocol();
