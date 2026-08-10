// Layer 3: Data Sanitizer — 消毒层主入口
// 职责：所有穿越智侠网的数据必须经过此层
// · 入站：P2P 原始数据 → 清洁摘要（保护下游 Agent）
// · 出站：CLI 用户输入 → 安全签名消息（防止误操作和攻击）

const { InboundSanitizer } = require('./inbound');
const { OutboundSanitizer } = require('./outbound');

class SanitizerLayer {
  constructor(options = {}) {
    this.inbound = new InboundSanitizer(options.inbound);
    this.outbound = new OutboundSanitizer(options.outbound);
    this.db = options.db || null;
    this.logger = options.logger || { warn: () => {}, error: () => {} };
    this.stats = {
      totalProcessed: 0,
      clean: 0,
      suspicious: 0,
      rejected: 0
    };
  }

  // ========== 入站消毒 ==========
  processInbound(rawFrame, context = {}) {
    const { peer_pubkey, topic } = context;
    this.stats.totalProcessed++;

    if (!rawFrame || typeof rawFrame !== 'object') {
      this._logThreat(peer_pubkey, topic, 'malformed_frame', 'Frame is not a valid object');
      return { action: 'drop', reason: 'malformed_frame' };
    }

    const result = this.inbound.sanitize(rawFrame);

    switch (result.action) {
      case 'drop': {
        this.stats.rejected++;
        this._logThreat(
          peer_pubkey, topic,
          result.warnings.some(w => w.includes('Prompt injection')) ? 'prompt_injection' : 'content_rejected',
          result.warnings.join('; '),
          result.original_hash
        );
        this.logger.warn(`[Sanitizer] REJECTED from ${peer_pubkey?.slice(0, 12)}: ${result.warnings.join('; ')}`);
        return { action: 'drop', reason: result.warnings.join('; '), hash: result.original_hash };
      }

      case 'quarantine': {
        this.stats.suspicious++;
        this._logThreat(peer_pubkey, topic, 'suspicious_content', result.warnings.join('; '), result.original_hash);
        this.logger.warn(`[Sanitizer] QUARANTINED from ${peer_pubkey?.slice(0, 12)}: ${result.warnings.join('; ')}`);
        return {
          action: 'deliver',
          event: this._buildSafeEvent(peer_pubkey, topic, result, 'suspicious')
        };
      }

      case 'deliver':
      default: {
        this.stats.clean++;
        return {
          action: 'deliver',
          event: this._buildSafeEvent(peer_pubkey, topic, result, 'clean')
        };
      }
    }
  }

  // ========== 出站校验 ==========
  processOutbound(command, params, context = {}) {
    const cmdCheck = this.outbound.validateCommand(command);
    if (!cmdCheck.ok) return cmdCheck;

    const paramCheck = this.outbound.validateParams(command, params);
    if (!paramCheck.ok) return paramCheck;

    if (params.file_path) {
      const pathCheck = this.outbound.sanitizePath(params.file_path);
      if (!pathCheck.ok) return pathCheck;
      params.file_path = pathCheck.path;
    }

    if (params.message) {
      const msgCheck = this.inbound.sanitize({
        msg_type: 'text',
        payload: params.message,
        ts: Date.now()
      });
      if (msgCheck.action === 'drop') {
        return { ok: false, error: `Message blocked: ${msgCheck.warnings.join('; ')}` };
      }
    }

    return { ok: true, params };
  }

  // ========== 组装签名消息 ==========
  signMessage(payload, keyPair) {
    return this.outbound.signPayload(payload, keyPair);
  }

  // ========== 内部工具 ==========
  _buildSafeEvent(peerPubkey, topic, sanitizeResult, safetyLevel) {
    return {
      type: 'event',
      event: 'peer_message',
      payload: {
        peer_pubkey: peerPubkey,
        topic: topic || 'unknown',
        msg_type: sanitizeResult.msg_type || 'text',
        summary: sanitizeResult.summary,
        safety_level: safetyLevel,
        content: sanitizeResult.content,
        original_hash: sanitizeResult.original_hash,
        warnings: sanitizeResult.warnings,
        received_at: Date.now()
      }
    };
  }

  _logThreat(peerPubkey, topic, threatType, details, contentHash = null) {
    if (!this.db) return;
    try {
      this.db.prepare(`
        INSERT INTO threat_log (peer_pubkey, threat_type, details, detected_at, action)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        peerPubkey || 'unknown',
        threatType,
        details + (contentHash ? ` | hash:${contentHash}` : ''),
        Date.now(),
        'blocked'
      );
    } catch (e) {
      this.logger.error(`[Sanitizer] Failed to log threat: ${e.message}`);
    }
  }

  getStats() {
    return { ...this.stats };
  }

  resetStats() {
    this.stats = { totalProcessed: 0, clean: 0, suspicious: 0, rejected: 0 };
  }
}

module.exports = { SanitizerLayer };
