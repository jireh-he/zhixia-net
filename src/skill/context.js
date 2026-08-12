class SkillContext {
  constructor() {
    this.requestId = null;
    this.agent = null;
    this.user = null;
  }
  create(data) {
    return {
      requestId: data.requestId,
      agent: data.agent,
      user: data.user
    };
  }
}

module.exports = new SkillContext();
