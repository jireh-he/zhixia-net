// v1.2 — Peer Manager（集成 STUN 检测 + 三模式连接策略）
// 启动时跑 STUN 检测确定 NAT 类型，connect 时真调 connectionStrategy
const natProbe = require('./nat-probe');
const holePunch = require('./hole-punch');
const connectionStrategy = require('./connection-strategy');
const peerTable = require('./peer-table');
const peerExchange = require('./peer-exchange');

class PeerManager {
  constructor() {
    this.id = null;
    this.myAddresses = [];
    this.myPort = 9000;
    this.natInfo = null;        // STUN 检测结果
    this.holePunchReady = false;
  }

  init(id, port) {
    this.id = id;
    this.myPort = port;
    const nat = natProbe.detect();
    // 收集本机可达地址
    for (const [name, addrs] of Object.entries(require('os').networkInterfaces())) {
      if (!addrs) continue;
      for (const a of addrs) {
        if (a.family === 'IPv4' && !a.internal) {
          this.myAddresses.push(`/ip4/${a.address}/tcp/${port}`);
        } else if (a.family === 'IPv6' && !a.internal && !a.address.startsWith('fe80')) {
          this.myAddresses.push(`/ip6/${a.address}/tcp/${port}`);
        }
      }
    }
    if (this.myAddresses.length === 0) {
      this.myAddresses.push(`/ip4/0.0.0.0/tcp/${port}`);
    }
    peerExchange.addPeer(this.id, this.myAddresses);
    return { id: this.id, addresses: this.myAddresses, nat };
  }

  // STUN 检测：确定 NAT 类型，决定是否启动打洞
  async detectNat(opts = {}) {
    this.natInfo = await natProbe.detectWithSTUN(opts);
    // 如果 NAT 类型需要打洞，预先启动 hole-punch socket
    if (['fullcone-direct', 'restrict-punching', 'hole-punching'].includes(this.natInfo.strategy)) {
      if (!holePunch.socket) {
        await holePunch.listen(0);
        this.holePunchReady = true;
      }
    }
    return this.natInfo;
  }

  // 连接 peer：真调 connectionStrategy.connect()
  async connectTo(peerId, peerAddresses) {
    // 确保 NAT 已检测
    if (!this.natInfo) {
      await this.detectNat();
    }

    // 真调 connectionStrategy.connect
    const result = await connectionStrategy.connect(peerId, peerAddresses, {
      nat: this.natInfo,
      myId: this.id
    });

    // 记录到 peer table
    peerTable.add(peerId, {
      addresses: peerAddresses,
      transport: result.strategy,
      ok: result.ok,
      myPort: result.myPort,
      targetAddr: result.targetAddr,
      targetPort: result.targetPort
    });

    if (result.ok) {
      peerTable.setConnected(peerId);
    }

    return {
      peerId,
      ok: result.ok,
      strategy: result.strategy,
      error: result.error,
      myPort: result.myPort,
      targetAddr: result.targetAddr,
      targetPort: result.targetPort
    };
  }

  // 推荐 peer 给新来的连接方
  exchangeWith(peerId) {
    return peerExchange.getKnownPeers(20);
  }

  // 收到 peer 推荐，加入本地表并尝试连接
  receivedPeerList(peers) {
    peerExchange.processPeerList(peers);
    for (const p of peers) {
      peerTable.add(p.id, { addresses: p.addresses, transport: 'discovered' });
    }
    return peers.length;
  }

  // 查找已直连的 peer
  findDirect(peerId) {
    return peerTable.find(peerId);
  }

  status() {
    return {
      id: this.id,
      addresses: this.myAddresses,
      nat: this.natInfo || natProbe.last || natProbe.detect(),
      holePunchReady: this.holePunchReady,
      peers: peerTable.list(),
      connected: peerTable.connected().length
    };
  }
}

module.exports = new PeerManager();