const registry = require('./registry');
const validator = require('./validator');

class SkillRouter {
  async execute(request) {
    if (!validator.validate(request)) {
      throw new Error('Invalid skill request');
    }
    const handler = registry.get(request.action);
    if (!handler) {
      throw new Error('Action unavailable');
    }
    return handler(request.arguments || {});
  }
}

module.exports = new SkillRouter();
