// Layer 3: Inbound Sanitizer
// 保护下游 Agent：所有入站数据消毒后才进入 stdout

const crypto = require('crypto');

// 提示词注入检测规则
const INJECTION_PATTERNS = [
  // 英文指令注入
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|commands?|prompts?)/i,
  /ignore\s+your\s+(instructions?|training|programming)/i,
  /system\s*prompt/i,
  /developer\s*mode/i,
  /DAN\s*mode/i,
  /jailbreak/i,
  /you\s+are\s+now\s+(?:a|an)\s+/i,
  /from\s+now\s+on\s+you\s+are/i,
  /forget\s+(?:everything|all|your)\s+(?:you|your|the)\s+(?:know|learned|instructions)/i,
  /(?:new|different)\s+instructions?\s*:/i,
  // XML/JSON 标签注入
  /<\|im_(?:start|end)\|>/,
  /<system>/i,
  /<\/?(?:user|assistant|system)>/i,
  /\{\s*"role"\s*:\s*"system"\s*\}/,
  // 编码隐藏
  /(?:base64|rot13|hex|url)\s*(?:decode|encode|convert)/i,
  // 角色扮演诱导
  /let's\s+play\s+a\s+game/i,
  /pretend\s+(?:to\s+be|you\s+are)/i,
  /act\s+as\s+(?:if\s+)?you\s+are/i,
];

// Unicode 同形字符检测（常见攻击字符）
const HOMOGLYPH_RANGES = [
  [0x0400, 0x04FF], // Cyrillic
  [0x0500, 0x052F], // Cyrillic Supplement
  [0x1D400, 0x1D7FF], // Mathematical Alphanumeric Symbols
];

class InboundSanitizer {
  constructor(options = {}) {
    this.maxTextLength = options.maxTextLength || 4096;
    this.allowedTypes = options.allowedTypes || ['text', 'blob_meta', 'stream_start', 'stream_chunk', 'vote'];
    this.contentClassifierThreshold = options.contentClassifierThreshold || 0.8;
    this.suspiciousThreshold = options.suspiciousThreshold || 0.5;
  }

  sanitize(rawMessage) {
    const result = {
      original_hash: null,
      safety_level: 'clean', // clean | suspicious | rejected
      summary: null,
      content: null,
      warnings: [],
      action: 'deliver' // deliver | quarantine | drop
    };

    try {
      // 1. Schema 校验
      const validated = this._validateSchema(rawMessage);
      if (!validated.ok) {
        result.safety_level = 'rejected';
        result.action = 'drop';
        result.warnings.push(`Schema validation failed: ${validated.error}`);
        return result;
      }

      // 2. 计算原始内容哈希
      result.original_hash = 'sha256:' + crypto.createHash('sha256')
        .update(JSON.stringify(rawMessage))
        .digest('hex');

      // 3. 长度限制
      if (validated.payload && validated.payload.length > this.maxTextLength) {
        result.warnings.push(`Content truncated from ${validated.payload.length} to ${this.maxTextLength}`);
        validated.payload = validated.payload.slice(0, this.maxTextLength);
      }

      // 4. 提示词注入检测
      const injectionCheck = this._detectPromptInjection(validated.payload || '');
      if (injectionCheck.detected) {
        result.safety_level = 'rejected';
        result.action = 'drop';
        result.warnings.push(`Prompt injection detected: ${injectionCheck.matched}`);
        return result;
      }

      // 5. 同形字符检测
      const homoglyphCheck = this._detectHomoglyphs(validated.payload || '');
      if (homoglyphCheck.detected) {
        result.warnings.push(`Homoglyph characters detected`);
        result.safety_level = 'suspicious';
      }

      // 6. 内容分级（简化版，可替换为模型）
      const classification = this._classifyContent(validated);
      if (classification.score < this.suspiciousThreshold) {
        result.safety_level = 'rejected';
        result.action = 'drop';
        result.warnings.push(`Content classification failed: ${classification.label}`);
        return result;
      }
      if (classification.score < this.contentClassifierThreshold) {
        result.safety_level = 'suspicious';
        result.warnings.push(`Low confidence classification: ${classification.label}`);
      }

      // 7. 生成安全摘要
      result.summary = this._generateSummary(validated);
      result.content = this._sanitizeContent(validated.payload || '');
      result.action = result.safety_level === 'suspicious' ? 'quarantine' : 'deliver';

      return result;

    } catch (e) {
      result.safety_level = 'rejected';
      result.action = 'drop';
      result.warnings.push(`Sanitizer exception: ${e.message}`);
      return result;
    }
  }

  _validateSchema(msg) {
    if (!msg || typeof msg !== 'object') {
      return { ok: false, error: 'Message must be an object' };
    }

    const allowedFields = ['msg_type', 'payload', 'ts', 'sig', 'stream_id', 'file_name', 'size'];
    const extraFields = Object.keys(msg).filter(k => !allowedFields.includes(k));
    if (extraFields.length > 0) {
      return { ok: false, error: `Extra fields not allowed: ${extraFields.join(', ')}` };
    }

    if (!this.allowedTypes.includes(msg.msg_type)) {
      return { ok: false, error: `Unknown msg_type: ${msg.msg_type}` };
    }

    if (typeof msg.ts !== 'number' || msg.ts < 0) {
      return { ok: false, error: 'Invalid timestamp' };
    }

    const age = Date.now() - msg.ts;
    if (age > 5 * 60 * 1000 || age < -5000) {
      return { ok: false, error: 'Timestamp out of valid window' };
    }

    return { ok: true, ...msg };
  }

  _detectPromptInjection(text) {
    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(text)) {
        return { detected: true, matched: pattern.toString() };
      }
    }
    // 检测编码隐藏（Base64 包裹的可疑字符串）
    const base64Matches = text.match(/[A-Za-z0-9+/]{40,}={0,2}/g);
    if (base64Matches) {
      for (const b64 of base64Matches) {
        try {
          const decoded = Buffer.from(b64, 'base64').toString('utf8');
          if (decoded.length > 10 && decoded.length < 500) {
            for (const pattern of INJECTION_PATTERNS) {
              if (pattern.test(decoded)) {
                return { detected: true, matched: `base64-encoded: ${pattern.toString()}` };
              }
            }
          }
        } catch (e) {
          // ignore
        }
      }
    }
    return { detected: false };
  }

  _detectHomoglyphs(text) {
    for (const char of text) {
      const code = char.codePointAt(0);
      for (const [start, end] of HOMOGLYPH_RANGES) {
        if (code >= start && code <= end) {
          return { detected: true, char, code };
        }
      }
    }
    return { detected: false };
  }

  _classifyContent(msg) {
    // 简化版分类器，生产环境可替换为 transformers.js 模型
    const text = (msg.payload || '').toLowerCase();

    // Spam 信号
    const spamSignals = [
      /click\s+here/i,
      /free\s+money/i,
      /urgent\s+action/i,
      /limited\s+time/i,
      /\$\$\$/,
      /http[s]?:\/\/\S{100,}/, // 超长链接
    ];
    for (const pattern of spamSignals) {
      if (pattern.test(text)) {
        return { label: 'spam', score: 0.2 };
      }
    }

    // 技术内容信号
    const techSignals = [
      /function\s+\w+\s*\(/,
      /import\s+\w+/,
      /class\s+\w+/,
      /async\s+\w+/,
      /await\s+/,
      /error|exception|bug|fix|patch/i,
      /memory\s+leak|buffer\s+overflow|sql\s+injection/i,
    ];
    let techScore = 0.5;
    for (const pattern of techSignals) {
      if (pattern.test(text)) techScore += 0.1;
    }
    if (techScore > 0.8) {
      return { label: 'technical', score: Math.min(techScore, 1.0) };
    }

    // 默认 social
    return { label: 'social', score: 0.7 };
  }

  _generateSummary(msg) {
    const typeMap = {
      text: '文本消息',
      blob_meta: '文件元数据',
      stream_start: '流媒体启动',
      stream_chunk: '流媒体分片',
      vote: '投票'
    };
    const typeLabel = typeMap[msg.msg_type] || msg.msg_type;
    const preview = (msg.payload || '').slice(0, 50).replace(/\s+/g, ' ');
    return `${typeLabel} — ${preview}${(msg.payload || '').length > 50 ? '...' : ''}`;
  }

  _sanitizeContent(text) {
    // 移除 HTML 标签
    let clean = text.replace(/<[^>]*>/g, '');
    // 移除 Markdown 图片/链接中的脚本
    clean = clean.replace(/!?\[([^\]]*)\]\((javascript|data):[^)]*\)/gi, '[$1](blocked)');
    // 规范化空白
    clean = clean.replace(/\s+/g, ' ').trim();
    return clean;
  }
}

module.exports = { InboundSanitizer };
