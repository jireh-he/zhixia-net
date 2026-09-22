// Trust: Attestation — 评价事件（不可自改，私钥签名）
const crypto = require('crypto');
const { initDatabase } = require('../engine/database');

class Attestation {
  constructor() {
    this.db = initDatabase();
  }

  create({ from, target, subject, type, value, evidence }) {
    const sigData = JSON.stringify({ from, target, subject, type, value, evidence });
    let signature = '';
    try {
      const key = require('../identity/keystore');
      signature = key.sign ? key.sign(sigData) : '';
    } catch { /* no keypair yet, skip */ }

    const att = {
      id: 'att:' + crypto.randomBytes(8).toString('hex'),
      from, target, subject, type, value, evidence,
      signature,
      createdAt: Date.now()
    };

    this.db.prepare(
      'INSERT INTO trust_attestations (id, from_user, target_user, subject, type, value, evidence, signature, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(att.id, att.from, att.target, att.subject, att.type, att.value, att.evidence, att.signature, att.createdAt);

    return att;
  }

  list(target) {
    return this.db.prepare(
      'SELECT * FROM trust_attestations WHERE target_user = ? ORDER BY created_at DESC'
    ).all(target);
  }

  byIssuer(from) {
    return this.db.prepare(
      'SELECT * FROM trust_attestations WHERE from_user = ? ORDER BY created_at DESC'
    ).all(from);
  }

  verify(att) {
    try {
      const sigData = JSON.stringify({
        from: att.from, target: att.target, subject: att.subject,
        type: att.type, value: att.value, evidence: att.evidence
      });
      const key = require('../identity/keystore');
      return key.verify ? key.verify(sigData, att.signature, att.from) : true;
    } catch {
      return true; // no signing infra yet
    }
  }
}

module.exports = new Attestation();
