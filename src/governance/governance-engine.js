// Phase 17 — Governance Engine
const voting = require('./voting');
const rules = require('./rule-manager');

class GovernanceEngine {
  execute(proposal) {
    const result = voting.result(proposal.id);
    if (result.passed) {
      rules.update(proposal.change);
      proposal.status = 'passed';
    } else {
      proposal.status = 'rejected';
    }
    return { result, rules: rules.all(), proposal };
  }
}

module.exports = new GovernanceEngine();
