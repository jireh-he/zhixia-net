#!/usr/bin/env node
// Layer 1: Network Daemon
// 纯 P2P 传输，零业务逻辑，最低权限运行

const Hyperswarm = require('hyperswarm');
const crypto = require('hypercore-crypto');
const { FrameEncoder, FrameDecoder } = require('./frame-protocol');
const identitySession = require('./identity-session');
const peerStore = require('../storage/peer-store');

const CONFIG = {
  maxMsgPerSec: 10,
  maxBytesPerSec: 100 * 1024,
  maxFrameSize: 50 * 1024 * 1024
};

class ZhixiaDaemon {
  constructor() {
    this.swarm = null;
    this.topicBuf = null;
    this.peers = new Map(); // pubkeyHex -> { conn, windowStart, msgCount, bytesCount, lastSeen }
    this.keyPair = crypto.keyPair();
    this.decoder = new FrameDecoder();
  }

  // 输出到 stdout（JSON Lines，给上层消费）
  outResult(id, data) {
    process.stdout.write(JSON.stringify({ type: 'result', id, data }) + '\n');
  }

  outEvent(event, payload) {
    process.stdout.write(JSON.stringify({ type: 'event', event, payload }) + '\n');
  }

  async join(topicName) {
    if (this.swarm) {
      await this.swarm.destroy();
      this.peers.clear();
    }

    // v0.3.1.3 加载身份
    if (!this._identity) {
      this._identity = await identitySession.load();
    }

    this.swarm = new Hyperswarm({ keyPair: this.keyPair });
    this.topicBuf = crypto.discoveryKey(Buffer.from(topicName, 'utf8'));

    await this.swarm.join(this.topicBuf, { client: true, server: true });

    this.swarm.on('connection', (conn) => {
      const pubHex = conn.remotePublicKey.toString('hex');
      const peer = {
        conn,
        windowStart: Date.now(),
        msgCount: 0,
        bytesCount: 0,
        lastSeen: Date.now(),
        identity: null
      };
      this.peers.set(pubHex, peer);
      this.outEvent('peer_connect', { peer_pubkey: pubHex, topic: topicName });

      // v0.3.1.3 发送 identity.hello
      this._sendHello(pubHex);

      const decoder = new FrameDecoder();
      conn.on('data', (chunk) => {
        try {
          const frames = decoder.feed(chunk);
          for (const frame of frames) {
            if (frame.type === 'json') {
              // v0.3.1.3 拦截 identity.hello
              if (frame.data && frame.data.type === 'identity.hello') {
                this._handleHello(pubHex, frame.data);
              } else {
                this.outEvent('peer_frame', { peer_pubkey: pubHex, frame: frame.data });
              }
            } else if (frame.type === 'binary') {
              this.outEvent('peer_blob', { peer_pubkey: pubHex, size: frame.data.length });
            }
          }
        } catch (e) {
          this.outEvent('peer_error', { peer_pubkey: pubHex, error: e.message });
          conn.destroy();
          this.peers.delete(pubHex);
        }
      });

      conn.on('close', () => {
        if (peer.identity) peerStore.remove(peer.identity.userId);
        this.peers.delete(pubHex);
        this.outEvent('peer_disconnect', { peer_pubkey: pubHex });
      });

      conn.on('error', (err) => {
        this.outEvent('peer_error', { peer_pubkey: pubHex, error: err.message });
        conn.destroy();
        this.peers.delete(pubHex);
      });
    });

    return { topic_hex: this.topicBuf.toString('hex'), my_pubkey: this.keyPair.publicKey.toString('hex') };
  }

  // v0.3.1.3 发送身份 hello
  async _sendHello(pubHex) {
    try {
      const hello = await identitySession.introduce();
      if (hello) this.sendJson(pubHex, hello);
    } catch (e) {
      // 无身份不阻塞连接
    }
  }

  // v0.3.1.3 接收并验证身份 hello
  async _handleHello(pubHex, data) {
    try {
      const info = await identitySession.accept(data);
      const peer = this.peers.get(pubHex);
      if (peer) peer.identity = info;
      peerStore.update(info);
      this.outEvent('peer_identity', { peer_pubkey: pubHex, ...info });
    } catch (e) {
      this.outEvent('peer_error', { peer_pubkey: pubHex, error: e.message });
    }
  }

  sendFrame(peerPubkey, frameBuffer) {
    const peer = this.peers.get(peerPubkey);
    if (!peer) return { ok: false, err: 'peer not connected' };

    const now = Date.now();
    if (now - peer.windowStart > 1000) {
      peer.windowStart = now;
      peer.msgCount = 0;
      peer.bytesCount = 0;
    }
    peer.msgCount++;
    peer.bytesCount += frameBuffer.length;

    if (peer.msgCount > CONFIG.maxMsgPerSec) {
      return { ok: false, err: 'rate limit exceeded (msg/s)' };
    }
    if (peer.bytesCount > CONFIG.maxBytesPerSec) {
      return { ok: false, err: 'rate limit exceeded (bytes/s)' };
    }

    peer.conn.write(frameBuffer);
    return { ok: true };
  }

  sendJson(peerPubkey, obj) {
    return this.sendFrame(peerPubkey, FrameEncoder.encodeJson(obj));
  }

  sendBinary(peerPubkey, buf) {
    return this.sendFrame(peerPubkey, FrameEncoder.encodeBinary(buf));
  }

  disconnect(peerPubkey) {
    const peer = this.peers.get(peerPubkey);
    if (peer) {
      peer.conn.destroy();
      this.peers.delete(peerPubkey);
    }
    return { ok: true };
  }

  async leave() {
    if (this.swarm) {
      await this.swarm.destroy();
      this.swarm = null;
    }
    this.peers.clear();
    return { ok: true };
  }

  listPeers() {
    return { peers: [...this.peers.keys()] };
  }
}

// ========== stdin 命令路由 ==========
const daemon = new ZhixiaDaemon();
let stdinBuf = '';

process.stdin.on('data', (chunk) => {
  stdinBuf += chunk.toString('utf8');
  let idx;
  while ((idx = stdinBuf.indexOf('\n')) !== -1) {
    const line = stdinBuf.slice(0, idx);
    stdinBuf = stdinBuf.slice(idx + 1);
    if (!line.trim()) continue;

    try {
      const cmd = JSON.parse(line);
      handleCommand(cmd);
    } catch (e) {
      daemon.outResult(null, { ok: false, err: 'Invalid JSON command: ' + e.message });
    }
  }
});

async function handleCommand(cmd) {
  const { id, action } = cmd;
  try {
    switch (action) {
      case 'join': {
        const res = await daemon.join(cmd.topic_name);
        daemon.outResult(id, { ok: true, ...res });
        break;
      }
      case 'list_peers':
        daemon.outResult(id, daemon.listPeers());
        break;
      case 'send_json': {
        const res = daemon.sendJson(cmd.peer_pubkey, cmd.payload);
        daemon.outResult(id, res);
        break;
      }
      case 'send_binary': {
        const buf = Buffer.from(cmd.data_b64, 'base64');
        const res = daemon.sendBinary(cmd.peer_pubkey, buf);
        daemon.outResult(id, { ...res, bytes: buf.length });
        break;
      }
      case 'disconnect': {
        daemon.disconnect(cmd.peer_pubkey);
        daemon.outResult(id, { ok: true });
        break;
      }
      case 'leave': {
        await daemon.leave();
        daemon.outResult(id, { ok: true });
        break;
      }
      default:
        daemon.outResult(id, { ok: false, err: 'Unknown action: ' + action });
    }
  } catch (e) {
    daemon.outResult(id, { ok: false, err: e.message });
  }
}

process.on('SIGTERM', async () => {
  if (daemon.swarm) await daemon.swarm.destroy();
  process.exit(0);
});
process.on('SIGINT', async () => {
  if (daemon.swarm) await daemon.swarm.destroy();
  process.exit(0);
});
