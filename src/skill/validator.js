class SkillValidator {
  validate(request) {
    if (!request.action) return false;
    if (typeof request.action !== 'string') return false;
    return true;
  }
}

module.exports = new SkillValidator();
