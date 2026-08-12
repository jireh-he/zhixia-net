class MCPTools {
  list() {
    const manifest = require('../skill/manifest.json');
    return manifest.actions.map(action => ({
      name: action.name,
      description: action.description,
      inputSchema: action.input
    }));
  }
}

module.exports = new MCPTools();
