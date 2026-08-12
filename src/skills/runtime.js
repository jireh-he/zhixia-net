// Phase 20 — Skill Runtime
const manifest = require('./manifest.json');

class SkillRuntime {
  constructor() { this.skills = new Map(); }

  register(name, skill) { this.skills.set(name, skill); }

  async execute(name, input) {
    const skill = this.skills.get(name);
    if (!skill) throw new Error('Skill not found: ' + name);
    const result = skill.execute(input);
    return result;
  }

  list() {
    const out = [];
    for (const [name, s] of this.skills) out.push({ name, skill: s.name || name });
    return out;
  }

  // 注册 manifest 中声明的所有 skill
  registerManifest() {
    for (const skill of manifest.skills) {
      this.register(skill.name, require('./' + skill.module));
    }
  }
}

module.exports = new SkillRuntime();
