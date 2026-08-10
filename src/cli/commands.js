// Layer 4: CLI Commands
const { spawn } = require('child_process');
const path = require('path');

class ZhixiaCLI {
  constructor(options = {}) {
    this.daemon = null;
    this.daemonPath = options.daemonPath || path.join(__dirname, '../daemon/index.js');
    this.stdoutBuf = '';
    this.pendingCmds = new Map();
    this.cmdSeq = 0;
    this.eventHandlers = new Map();
    this.logger = options.logger || console;
  }

  // 启动 Daemon 子进程
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
        reject(new Error(`Daemon exited`));
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
        this._emitEvent(obj.event, obj.payload);
      }
    } catch (e) {
      this.logger.error(`[CLI] Invalid daemon output: ${line.slice(0, 200)}`);
    }
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

  // ========== CLI 命令实现 ==========

  async join(topicName, options = {}) {
    if (!options.yes) {
      // 交互确认（简化版，实际可用 readline）
      console.error(`⚠️  将加入 Topic "${topicName}"，开始接收来自陌生 Agent 的消息。`);
      console.error(`   使用 --yes 跳过确认`);
    }
    return this.sendCmd('join', { topic_name: topicName });
  }

  async leave() {
    return this.sendCmd('leave');
  }

  async listPeers() {
    return this.sendCmd('list_peers');
  }

  async send(peerPubkey, message) {
    return this.sendCmd('send_json', {
      peer_pubkey: peerPubkey,
      payload: { msg_type: 'text', payload: message, ts: Date.now() }
    });
  }

  async sendFile(peerPubkey, filePath, options = {}) {
    if (!options.yes) {
      console.error(`⚠️  将向 ${peerPubkey.slice(0, 12)}... 发送文件 ${filePath}`);
      console.error(`   使用 --yes 跳过确认`);
    }
    const fs = require('fs');
    const buf = fs.readFileSync(filePath);
    return this.sendCmd('send_binary', {
      peer_pubkey: peerPubkey,
      data_b64: buf.toString('base64')
    });
  }

  async disconnect(peerPubkey) {
    return this.sendCmd('disconnect', { peer_pubkey: peerPubkey });
  }

  async startEvents() {
    // 前台事件监听模式
    this.startDaemon();
    console.error('[INFO] 开始监听 P2P 事件，按 Ctrl+C 退出');
    // 保持进程运行
    return new Promise(() => {});
  }

  stop() {
    if (this.daemon && !this.daemon.killed) {
      this.daemon.kill();
      this.daemon = null;
    }
  }
}

module.exports = { ZhixiaCLI };
