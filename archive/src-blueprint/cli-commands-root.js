// Layer 4: CLI Commands — 已接入消毒层
const { spawn } = require('child_process');
const path = require('path');
const { SanitizerLayer } = require('../sanitizer');
const { initDatabase } = require('../engine/database');

class ZhixiaCLI {
  constructor(options = {}) {
    this.daemon = null;
    this.daemonPath = options.daemonPath || path.join(__dirname, '../daemon/index.js');
    this.stdoutBuf = '';
    this.pendingCmds = new Map();
    this.cmdSeq = 0;
    this.eventHandlers = new Map();
    this.logger = options.logger || console;

    // 初始化数据库和消毒层
    this.db = initDatabase();
    this.sanitizer = new SanitizerLayer({
      db: this.db,
      logger: this.logger,
      inbound: {
        maxTextLength: 4096,
        contentClassifierThreshold: 0.8,
        suspiciousThreshold: 0.5
      },
      outbound: {
        allowedBasePath: process.cwd(),
        maxFileSize: 50 * 1024 * 1024
      }
    });
  }

  startDaemon() {
    if (this.daemon && !this.daemon.killed) return;

    this.daemon = spawn('node', [this.daemonPath], {
      stdio: ['pipe', 'pipe', 'inherit']
    });

    this.daemon.stdout.on('data', (buf) => {
      this.stdoutBuf += buf.toString('utf8');
      let idx;
      while ((idx = this.stdoutBuf.indexOf('\n')) !== -1) {
        const line = this.stdoutBuf.slice(0, idx);
        this.stdoutBuf = this.stdoutBuf.slice(idx + 1);
        if (!line.trim()) continue;
        this._handleDaemonLine(line);
      }
    });

    this.daemon.on('close', (code) => {
      this.logger.error(`[CLI] Daemon exited with code ${code}`);
      this.daemon = null;
      for (const [id, { reject }] of this.pendingCmds) {
        reject(new Error('Daemon exited'));
      }
      this.pendingCmds.clear();
    });

    this.daemon.on('error', (err) => {
      this.logger.error(`[CLI] Daemon error: ${err.message}`);
    });
  }

  _handleDaemonLine(line) {
    try {
      const obj = JSON.parse(line);
      if (obj.type === 'result' && this.pendingCmds.has(obj.id)) {
        const { resolve, reject } = this.pendingCmds.get(obj.id);
        this.pendingCmds.delete(obj.id);
        if (obj.data && obj.data.err) {
          reject(new Error(obj.data.err));
        } else {
          resolve(obj.data);
        }
      } else if (obj.type === 'event') {
        // 所有入站事件必须经过消毒层
        this._processInboundEvent(obj.event, obj.payload);
      }
    } catch (e) {
      this.logger.error(`[CLI] Invalid daemon output: ${line.slice(0, 200)}`);
    }
  }

  // ========== 核心：入站事件消毒 ==========
  _processInboundEvent(eventName, payload) {
    // 只有 peer_frame 需要深度消毒（含用户消息内容）
    if (eventName === 'peer_frame') {
      const result = this.sanitizer.processInbound(payload.frame, {
        peer_pubkey: payload.peer_pubkey,
        topic: payload.topic
      });

      if (result.action === 'drop') {
        this.logger.warn(`[CLI] Dropped message from ${payload.peer_pubkey?.slice(0, 12)}: ${result.reason}`);
        return;
      }

      // 输出消毒后的事件（clean 或 suspicious）
      this._emitEvent('peer_message', result.event.payload);
      return;
    }

    // peer_blob 也需要基础校验
    if (eventName === 'peer_blob') {
      this._emitEvent('peer_blob', {
        peer_pubkey: payload.peer_pubkey,
        size: payload.size,
        received_at: Date.now()
      });
      return;
    }

    // 其他事件（connect/disconnect/error）直接透传
    this._emitEvent(eventName, payload);
  }

  _emitEvent(eventName, payload) {
    const handlers = this.eventHandlers.get(eventName) || [];
    for (const handler of handlers) {
      try {
        handler(payload);
      } catch (e) {
        this.logger.error(`[CLI] Event handler error: ${e.message}`);
      }
    }
  }

  on(eventName, handler) {
    if (!this.eventHandlers.has(eventName)) {
      this.eventHandlers.set(eventName, []);
    }
    this.eventHandlers.get(eventName).push(handler);
  }

  off(eventName, handler) {
    const handlers = this.eventHandlers.get(eventName) || [];
    const idx = handlers.indexOf(handler);
    if (idx !== -1) handlers.splice(idx, 1);
  }

  async sendCmd(action, args = {}) {
    this.startDaemon();
    const id = ++this.cmdSeq;
    return new Promise((resolve, reject) => {
      this.pendingCmds.set(id, { resolve, reject });
      const cmd = JSON.stringify({ id, action, ...args });
      this.daemon.stdin.write(cmd + '\n', (err) => {
        if (err) {
          this.pendingCmds.delete(id);
          reject(err);
        }
      });
    });
  }

  // ========== CLI 命令实现（已接入出站消毒） ==========

  async join(topicName, options = {}) {
    const check = this.sanitizer.processOutbound('join', { topic_name: topicName });
    if (!check.ok) throw new Error(check.error);

    if (!options.yes) {
      console.error(`⚠️  将加入 Topic "${topicName}"，开始接收来自陌生 Agent 的消息。`);
      console.error(`   使用 --yes 跳过确认`);
    }
    return this.sendCmd('join', { topic_name: topicName });
  }

  async leave() {
    const check = this.sanitizer.processOutbound('leave', {});
    if (!check.ok) throw new Error(check.error);
    return this.sendCmd('leave');
  }

  async listPeers() {
    return this.sendCmd('list_peers');
  }

  async send(peerPubkey, message) {
    const check = this.sanitizer.processOutbound('send', {
      peer_pubkey: peerPubkey,
      message: message
    });
    if (!check.ok) throw new Error(check.error);

    return this.sendCmd('send_json', {
      peer_pubkey: peerPubkey,
      payload: { msg_type: 'text', payload: message, ts: Date.now() }
    });
  }

  async sendFile(peerPubkey, filePath, options = {}) {
    const check = this.sanitizer.processOutbound('send-file', {
      peer_pubkey: peerPubkey,
      file_path: filePath
    });
    if (!check.ok) throw new Error(check.error);

    if (!options.yes) {
      console.error(`⚠️  将向 ${peerPubkey.slice(0, 12)}... 发送文件 ${check.params.file_path}`);
      console.error(`   使用 --yes 跳过确认`);
    }

    const fs = require('fs');
    const buf = fs.readFileSync(check.params.file_path);
    return this.sendCmd('send_binary', {
      peer_pubkey: peerPubkey,
      data_b64: buf.toString('base64')
    });
  }

  async disconnect(peerPubkey) {
    const check = this.sanitizer.processOutbound('disconnect', { peer_pubkey: peerPubkey });
    if (!check.ok) throw new Error(check.error);
    return this.sendCmd('disconnect', { peer_pubkey: peerPubkey });
  }

  async startEvents() {
    this.startDaemon();
    console.error('[INFO] 开始监听 P2P 事件，按 Ctrl+C 退出');
    return new Promise(() => {});
  }

  getSanitizerStats() {
    return this.sanitizer.getStats();
  }

  stop() {
    if (this.daemon && !this.daemon.killed) {
      this.daemon.kill();
      this.daemon = null;
    }
    if (this.db) {
      this.db.close();
    }
  }
}

module.exports = { ZhixiaCLI };
