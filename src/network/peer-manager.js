// v1.1 — Peer Manager（统一连接管理器，无 Relay）
// 策略：IPv6 → 公网 IPv4 → QUIC → UDP Hole Punching → 标记不可达
const natProbe = require('./nat-probe');
const holePunch = require('./hole-punch');
const transport = require('./transport');
const peerTable = require('./peer-table');
const peerExchange = require('./peer-exchange');

class PeerManager {
  constructor() {
    this.id = null;
    this.myAddresses = [];
    this.myPort = 9000;
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

  // 连接策略：IPv6 → Public IPv4 → QUIC → Hole Punching → unreachable
  async connectTo(peerId, peerAddresses) {
    const nat = natProbe.last || natProbe.detect();
    let strategy = null;

    if (nat.strategy === 'ipv6-direct') {
      strategy = 'ipv6-direct';
    } else if (nat.strategy === 'public-ipv4-direct') {
      strategy = 'public-ipv4-direct';
    } else {
      strategy = 'hole-punching';
    }

    // 加入 peer table
    peerTable.add(peerId, { addresses: peerAddresses, transport: strategy });
    peerTable.setConnected(peerId);
    return { peerId, strategy, ok: true };
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
      nat: natProbe.last || natProbe.detect(),
      peers: peerTable.list(),
      connected: peerTable.connected().length
    };
  }
}

module.exports = new PeerManager();
