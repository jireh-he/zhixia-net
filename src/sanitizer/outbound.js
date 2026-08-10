// Layer 3: Outbound Sanitizer
// 防止误操作：路径安全、参数校验、签名封装

const path = require('path');
const fs = require('fs');

class OutboundSanitizer {
  constructor(options = {}) {
    this.allowedBasePath = options.allowedBasePath || process.cwd();
    this.maxFileSize = options.maxFileSize || 50 * 1024 * 1024; // 50MB
    this.allowedCommands = options.allowedCommands || [
      'join', 'leave', 'send', 'send-file', 'stream-start',
      'stream-send', 'disconnect', 'reputation', 'vote'
    ];
  }

  // 路径安全校验
  sanitizePath(inputPath) {
    if (!inputPath || typeof inputPath !== 'string') {
      return { ok: false, error: 'Path must be a non-empty string' };
    }

    const resolved = path.resolve(inputPath);
    const baseResolved = path.resolve(this.allowedBasePath);

    if (!resolved.startsWith(baseResolved)) {
      return { ok: false, error: 'Path traversal blocked' };
    }

    // 检查符号链接
    try {
      const realPath = fs.realpathSync(resolved);
      if (!realPath.startsWith(baseResolved)) {
        return { ok: false, error: 'Symlink traversal blocked' };
      }
    } catch (e) {
      return { ok: false, error: `Path does not exist: ${resolved}` };
    }

    // 检查文件存在且是普通文件
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) {
      return { ok: false, error: 'Not a regular file' };
    }
    if (stat.size > this.maxFileSize) {
      return { ok: false, error: `File too large: ${stat.size} > ${this.maxFileSize}` };
    }

    return { ok: true, path: resolved, size: stat.size };
  }

  // 命令白名单校验
  validateCommand(command) {
    if (!this.allowedCommands.includes(command)) {
      return { ok: false, error: `Command not allowed: ${command}` };
    }
    return { ok: true };
  }

  // 参数 Schema 校验
  validateParams(command, params) {
    const schemas = {
      join: {
        required: ['topic_name'],
        types: { topic_name: 'string' }
      },
      send: {
        required: ['peer_pubkey', 'message'],
        types: { peer_pubkey: 'string', message: 'string' }
      },
      'send-file': {
        required: ['peer_pubkey', 'file_path'],
        types: { peer_pubkey: 'string', file_path: 'string' }
      },
      disconnect: {
        required: ['peer_pubkey'],
        types: { peer_pubkey: 'string' }
      },
      reputation: {
        required: ['peer_pubkey'],
        types: { peer_pubkey: 'string', topic: 'string' }
      }
    };

    const schema = schemas[command];
    if (!schema) {
      return { ok: true }; // 无 schema 的命令不做严格校验
    }

    for (const field of schema.required) {
      if (!(field in params)) {
        return { ok: false, error: `Missing required param: ${field}` };
      }
      const expectedType = schema.types[field];
      if (expectedType && typeof params[field] !== expectedType) {
        return { ok: false, error: `Param ${field} must be ${expectedType}` };
      }
    }

    // 拒绝额外字段
    const allowedFields = Object.keys(schema.types);
    const extraFields = Object.keys(params).filter(k => !allowedFields.includes(k));
    if (extraFields.length > 0) {
      return { ok: false, error: `Extra params not allowed: ${extraFields.join(', ')}` };
    }

    return { ok: true };
  }

  // 组装签名消息
  signPayload(payload, keyPair) {
    const crypto = require('hypercore-crypto');
    const ts = Date.now();
    const nonce = crypto.randomBytes(8).toString('hex');

    const body = {
      ...payload,
      ts,
      nonce
    };

    const sigPayload = Buffer.from(JSON.stringify(body));
    const sig = crypto.sign(sigPayload, keyPair.secretKey).toString('hex');

    return {
      ...body,
      sig
    };
  }
}

module.exports = { OutboundSanitizer };
