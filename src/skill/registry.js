class SkillRegistry {
  constructor() { this.actions = new Map(); }
  register(name, handler) { this.actions.set(name, handler); }
  get(name) { return this.actions.get(name); }
  list() { return [...this.actions.keys()]; }
}

module.exports = new SkillRegistry();
