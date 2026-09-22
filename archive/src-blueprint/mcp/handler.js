const router = require('../skill/router');
const tools = require('./tools');

class MCPHandler {
  async handle(request) {
    switch (request.method) {
      case 'tools/list':
        return { tools: tools.list() };
      case 'tools/call':
        return await router.execute({
          action: request.params.name,
          arguments: request.params.arguments
        });
      default:
        throw new Error('Unknown MCP method');
    }
  }
}

module.exports = new MCPHandler();
