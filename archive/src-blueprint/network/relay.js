// v1.1 — Relay（TCP 消息中转）
// 职责：NAT 节点无法直连时，通过 Relay 中转消息
// 协议：JSON Lines over TCP
// 安全：不参与消息加解密，仅转发

const net = require('net');

class RelayServer {
  constructor() {
    this.server = null;
    this.peers = new Map(); // zid -> { conn, id, lastSeen }
    this.port = null;
  }

  start(port) {
    return new Promise((resolve, reject) => {
      this.port = port;
      this.server = net.createServer((conn) => {
        this._handleConn(conn);
      });
      this.server.listen(port, '0.0.0.0', () => {
        console.log(`Relay server listening on port ${port}`);
        resolve(this);
      });
      this.server.on('error', reject);
    });
  }

  _handleConn(conn) {
    let peerId = null;
    let buf = '';

    conn.on('data', (d) => {
      buf += d.toString();
      const lines = buf.split('\n');
      buf = lines.pop();

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          this._handleMsg(peerId, msg, conn);
        } catch (e) {
          conn.write(JSON.stringify({ type: 'error', error: 'bad json' }) + '\n');
        }
      }
    });

    conn.on('close', () => {
      if (peerId) {
        this.peers.delete(peerId);
        console.log(`  peer disconnected: ${peerId} (${this.peers.size} remaining)`);
      }
    });

    conn.on('error', () => {
      if (peerId) this.peers.delete(peerId);
    });
  }

  _handleMsg(peerId, msg, conn) {
    const me = msg.from || peerId;

    // register
    if (msg.type === 'register') {
      peerId = me;
      this.peers.set(peerId, { conn, id: peerId, lastSeen: Date.now() });
      console.log(`  peer registered: ${peerId} (${this.peers.size} total)`);
      // 回复已注册的 peer 列表（让新节点知道网络里谁在线）
      const onlinePeers = [];
      for (const [id, p] of this.peers) {
        if (id !== peerId) onlinePeers.push({ id, addresses: p.addresses });
      }
      conn.write(JSON.stringify({ type: 'registered', peers: onlinePeers, relayPort: this.port }) + '\n');
    }
    // relay: 转发消息给目标
    else if (msg.type === 'relay') {
      const target = msg.to;
      if (!target) {
        conn.write(JSON.stringify({ type: 'error', error: 'missing to' }) + '\n');
        return;
      }
      const targetPeer = this.peers.get(target);
      if (!targetPeer) {
        conn.write(JSON.stringify({ type: 'error', error: 'target not online', to: target }) + '\n');
        return;
      }
      // 转发
      const forward = { ...msg, type: 'msg', relayed: true };
      targetPeer.conn.write(JSON.stringify(forward) + '\n');
      conn.write(JSON.stringify({ type: 'relay_ack', to: target, relayed: true }) + '\n');
    }
    // ping
    else if (msg.type === 'ping') {
      conn.write(JSON.stringify({ type: 'pong', from: me, ts: Date.now(), peers: this.peers.size }) + '\n');
    }
    // heartbeat
    else if (msg.type === 'heartbeat') {
      const p = this.peers.get(peerId);
      if (p) p.lastSeen = Date.now();
      conn.write(JSON.stringify({ type: 'heartbeat_ack', peers: this.peers.size }) + '\n');
    }
    // 普通消息（直连场景）
    else if (msg.type === 'msg' && peerId) {
      // 如果消息有 to，尝试通过 relay 转发
      if (msg.to) {
        const targetPeer = this.peers.get(msg.to);
        if (targetPeer) {
          targetPeer.conn.write(JSON.stringify(msg) + '\n');
        }
      }
    }
    else {
      conn.write(JSON.stringify({ type: 'ack', from: me }) + '\n');
    }
  }

  status() {
    return { port: this.port, peers: this.peers.size, online: [...this.peers.keys()] };
  }

  close() {
    if (this.server) { this.server.close(); this.server = null; }
    this.peers.clear();
  }
}

module.exports = new RelayServer();