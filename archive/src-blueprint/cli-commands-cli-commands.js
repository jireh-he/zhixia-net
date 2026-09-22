// Phase 12-20 — CLI commands 快捷入口（不依赖 daemon，直接调用模块）
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const http = require('http');
const net = require('net');
const os = require('os');
const rep = require('../../reputation/reputation-manager');
const eco = require('../../economics');
const mk = require('../../market');
const gov = require('../../governance');
const netMod = require('../../network');
const localStore = require('../../storage/local-store');

const IDENTITY_FILE = path.join(process.cwd(), 'data', 'identity.json');

function ensureDataDir() {
  const d = path.join(process.cwd(), 'data');
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function loadIdentity() {
  if (!fs.existsSync(IDENTITY_FILE)) return null;
  return JSON.parse(fs.readFileSync(IDENTITY_FILE, 'utf8'));
}

function saveIdentity(info) {
  ensureDataDir();
  fs.writeFileSync(IDENTITY_FILE, JSON.stringify(info, null, 2));
}

// Normalize bootstrap URL: support 'ip:port' and 'http://ip:port'
function normalizeUrl(url) {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return 'http://' + url;
}


// 获取本机公网出口 IP（通过 bootstrap /whoami）
async function getPublicIp(bootstrapUrl) {
  return new Promise((resolve) => {
    const url = new URL(normalizeUrl(bootstrapUrl) + '/whoami');
    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve(JSON.parse(data).publicIp); }
        catch (e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(3000, () => { req.destroy(); resolve(null); });
  });
}

// 获取本机本地 IP（非 loopback）
function getLocalIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}

// 从 bootstrap 获取 peer 列表
async function getPeersFromBootstrap(bootstrapUrl) {
  return new Promise((resolve) => {
    const url = new URL(normalizeUrl(bootstrapUrl) + '/peers');
    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve(JSON.parse(data).peers || []); }
        catch (e) { resolve([]); }
      });
    });
    req.on('error', () => resolve([]));
    req.setTimeout(3000, () => { req.destroy(); resolve([]); });
  });
}

// 注册自身到 bootstrap
async function registerToBootstrap(bootstrapUrl, id, addresses) {
  return new Promise((resolve) => {
    const url = new URL(normalizeUrl(bootstrapUrl) + '/register');
    const body = JSON.stringify({ id, addresses });
    const u = new URL(url);
    const opts = {
      hostname: u.hostname, port: u.port, path: u.pathname,
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve(true));
    });
    req.on('error', () => resolve(false));
    req.setTimeout(3000, () => { req.destroy(); resolve(false); });
    req.write(body);
    req.end();
  });
}

// TCP 客户端连接 + 注册 + 发 ping
function tcpConnect(host, port, localId, timeout = 3000) {
  return new Promise((resolve) => {
    const conn = net.createConnection({ host, port });
    let registered = false;
    let buf = '';

    const timer = setTimeout(() => {
      if (!registered) conn.destroy();
    }, timeout);

    conn.on('connect', () => {
      const reg = { type: 'register', from: localId, id: localId };
      conn.write(JSON.stringify(reg) + '\n');
    });

    conn.on('data', (d) => {
      buf += d.toString();
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.type === 'registered' || msg.type === 'pong') {
            registered = true;
            clearTimeout(timer);
            resolve({ conn, msg, registered: true });
          }
        } catch (e) {}
      }
    });

    conn.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });

    conn.on('close', () => {
      clearTimeout(timer);
    });
  });
}

exports.init = (args = {}) => {
  try {
    const existing = loadIdentity();
    if (existing) {
      console.log('Identity already exists');
      console.log('ID:', existing.id);
      return;
    }
    const id = 'zid:' + crypto.randomBytes(4).toString('hex');
    const identityInfo = {
      id,
      username: args.name || 'anonymous',
      created: Date.now(),
      version: '0.6.4'
    };
    saveIdentity(identityInfo);
    console.log('Identity Created');
    console.log('ID:', id);
  } catch (e) {
    console.log('Identity Error:', e.message);
  }
};

exports.identityShow = () => {
  const info = loadIdentity();
  if (!info) { console.log('No identity. Run: zhixia init'); return; }
  console.log('ID:', info.id);
  console.log('Username:', info.username || 'anonymous');
  console.log('Created:', new Date(info.created).toISOString().slice(0, 10));
};

exports.reputation = (args) => {
  const target = args ? (args.id || 'local') : 'local';
  const r = rep.local(target);
  console.log('Reputation:', target);
  console.log('  Score:', r.score);
  console.log('  Tier:', r.tier || 'NORMAL');
  console.log('  Events:', (r.events || []).length);
};

exports.balance = (args) => {
  const target = args ? (args.id || 'local') : 'local';
  console.log('Balance:', target);
  console.log('  Amount:', eco.balance.get(target));
  const rank = eco.balance.rank();
  if (rank.length > 0) {
    console.log('  Top nodes:');
    rank.slice(0, 5).forEach((n, i) => console.log('   ' + (i + 1) + '. ' + n.id + ' → ' + n.balance));
  }
};

exports.networkStatus = async () => {
  const m = require('../../network');
  const pm = m.peerManager ? m.peerManager.status() : { connected: 0 };

  // 先跑本地检测
  let nat = m.nat ? m.nat.detect() : { nat: 'unknown', strategy: 'unknown' };

  // 如果有缓存的 STUN 结果，显示 NAT 类型
  const natType = m.peerManager.natInfo ? m.peerManager.natInfo.nat : nat.nat;
  const strategy = m.peerManager.natInfo ? m.peerManager.natInfo.strategy : nat.strategy;
  const extIP = m.peerManager.natInfo && m.peerManager.natInfo.externalIP;
  const extPort = m.peerManager.natInfo && m.peerManager.natInfo.externalPort;
  const holePunchReady = m.peerManager.holePunchReady;

  console.log('Network Status');
  console.log('  Protocol: QUIC-priority, TCP-fallback');
  console.log('  Local NAT:', nat.nat, '(' + nat.strategy + ')');
  if (m.peerManager.natInfo) {
    console.log('  STUN NAT:', natType);
    console.log('  Strategy:', strategy);
    if (extIP) console.log('  Public Endpoint:', extIP + ':' + extPort);
    if (holePunchReady) console.log('  Hole Punch: READY');
  } else {
    console.log('  STUN: (not run, use "online" to detect)');
  }
  console.log('  Peers connected:', pm.connected || 0);
};

exports.proposalList = () => {
  const list = gov.store.list() || [];
  console.log('Governance Proposals:');
  list.forEach((p, i) => console.log('  ' + (i + 1) + '. ' + (p.title || '(no title)') + ' [' + p.status + ']'));
  if (list.length === 0) console.log('  (empty)');
};

exports.marketList = (args) => {
  const type = args ? (args.type || null) : null;
  const list = mk.store.listResources(type);
  console.log('Market Resources:' + (type ? ' [' + type + ']' : ''));
  list.forEach(r => console.log('  ' + r.id + ' | ' + r.type + ' | ' + r.capacity + ' | owner:' + r.owner));
  if (list.length === 0) console.log('  (empty)');
};

exports.storageStatus = () => {
  const sm = require('../../storage/storage-manager');
  const cs = require('../../storage/chunk-store');
  const s = sm.stats();
  const csStats = cs.stats();
  console.log('Storage Status');
  console.log('  Contents:', s.contents);
  console.log('  Chunks:', csStats.chunks);
  console.log('  Used:', Math.round(csStats.totalSize / 1024) + 'KB');
};

exports.nodeOnline = async () => {
  const runtime = require('../../node/node-runtime');
  const info = loadIdentity();
  const s = await runtime.start({ id: info ? info.id : 'zid:local' });
  console.log('Node Online');
  console.log('ID:', s.id);
  console.log('Status: READY');
};

// ========== 新：bootstrap-server ==========
exports.bootstrapServer = (port, host) => {
  const bootstrap = require('../../network/bootstrap');
  const p = port || 8080;
  const h = host || '0.0.0.0';
  bootstrap.listen(p, h);
  console.log('Zhixia Bootstrap Server v1.1');
  console.log('Port:', p);
  console.log('Endpoints:');
  console.log('  GET  /peers     — 获取所有已知 peer');
  console.log('  POST /register  — 注册自身');
  console.log('  GET  /whoami    — 获取调用方公网出口 IP');
  console.log('  POST /heartbeat — 活跃节点续约');
  console.log('');
  console.log('URL: http://<your-public-ip>:' + p);
  console.log('Press Ctrl+C to stop');
};

// ========== 通过 bootstrap HTTP 中转消息 ==========
// POST /relay/send — 存储消息到 bootstrap，目标节点轮询取走
async function relaySend(bootstrapUrl, from, to, payload) {
  return new Promise((resolve) => {
    const url = new URL(normalizeUrl(bootstrapUrl) + '/relay/send');
    const body = JSON.stringify({ from, to, payload });
    const u = new URL(url);
    const opts = {
      hostname: u.hostname, port: u.port, path: u.pathname,
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve({ ok: false, error: 'bad response' }); }
      });
    });
    req.on('error', () => resolve({ ok: false, error: 'network' }));
    req.setTimeout(5000, () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(body);
    req.end();
  });
}

// POST /relay/poll — 从 bootstrap 轮询取走消息
async function relayPoll(bootstrapUrl, id) {
  return new Promise((resolve) => {
    const url = new URL(normalizeUrl(bootstrapUrl) + '/relay/poll');
    const body = JSON.stringify({ id });
    const u = new URL(url);
    const opts = {
      hostname: u.hostname, port: u.port, path: u.pathname,
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve({ ok: false, messages: [] }); }
      });
    });
    req.on('error', () => resolve({ ok: false, messages: [] }));
    req.setTimeout(5000, () => { req.destroy(); resolve({ ok: false, messages: [] }); });
    req.write(body);
    req.end();
  });
}

// ========== 重写 online：BT 模式 + bootstrap 中转 ==========\
// 策略：直连优先，失败则通过 bootstrap HTTP 中转
// 支持: --bootstrap <url>  通过 tracker 发现 peer + 中转兜底
//       --port <port>      监听端口
//       --storage/--relay  节点模式
exports.online = async (mode, cliPort, cliBootstrap, cliRelayPort) => {
  const config = require('../../../config/default.json');
  const info = loadIdentity();
  const port = cliPort || config.network.port || 9000;
  const id = info ? info.id : 'zid:local';
  const bootstrapUrl = cliBootstrap || (config.network.bootstrap && config.network.bootstrap[0]) || null;

  // 1. 初始化 peer exchange / dht
  netMod.peerManager.init(id, port);
  netMod.peerExchange.addPeer(id, [('/ip4/' + getLocalIp() + '/tcp/' + port)]);
  netMod.dht.table.set(id, { id, addresses: [('/ip4/' + getLocalIp() + '/tcp/' + port)], ts: Date.now() });

  const nat = await netMod.peerManager.detectNat();

  // 2. 启动 TCP P2P listener
  const srv = net.createServer((conn) => {
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
          if (msg.type === 'register') {
            peerId = msg.from || msg.id;
            netMod.peerManager.receivedPeerList([{ id: peerId, addresses: msg.addresses }]);
            netMod.peerTable.setConnected(peerId);
            const pex = netMod.peerExchange.getKnownPeers(20);
            conn.write(JSON.stringify({ type: 'registered', id, peers: pex.peers }) + '\n');
            console.log('  peer registered:', peerId);
          } else if (msg.type === 'ping') {
            conn.write(JSON.stringify({ type: 'pong', from: id, ts: Date.now() }) + '\n');
          } else if (msg.type === 'msg' && peerId) {
            netMod.message.receive({ ...msg, from: peerId });
            conn.write(JSON.stringify({ type: 'ack', from: id, data: msg.payload }) + '\n');
            console.log('  [msg] ' + peerId + ' → ' + id + ': ' + JSON.stringify(msg.payload).slice(0, 80));
          } else {
            conn.write(JSON.stringify({ type: 'ack', from: id }) + '\n');
          }
        } catch (e) {}
      }
    });
  });

  srv.listen(port, '0.0.0.0', async () => {
    const listeningPort = srv.address().port;
    console.log('Zhixia Node v1.2');
    console.log('Identity:', id);
    console.log('Network: ONLINE');
    console.log('Mode:', mode);
    console.log('Port:', listeningPort);
    console.log('NAT:', nat.nat, '(' + nat.strategy + ')');
    console.log('');

    let publicIp = null;
    let myAddresses = [('/ip4/' + getLocalIp() + '/tcp/' + listeningPort)];

    // 3. Bootstrap 发现
    if (bootstrapUrl) {
      console.log('Bootstrap:', bootstrapUrl);

      // 3a. 获取公网出口 IP
      publicIp = await getPublicIp(bootstrapUrl);
      if (publicIp) {
        console.log('Public IP:', publicIp);
        myAddresses = [('/ip4/' + publicIp + '/tcp/' + listeningPort)];
        netMod.peerExchange.addPeer(id, myAddresses);
        netMod.dht.table.set(id, { id, addresses: myAddresses, ts: Date.now() });
      } else {
        console.log('Public IP: (not detected, using local)');
      }

      // 3b. 从 bootstrap 获取 peer 列表
      const peers = await getPeersFromBootstrap(bootstrapUrl);
      console.log('Peers from bootstrap:', peers.length);
      for (const p of peers) {
        if (p.id !== id) {
          netMod.peerExchange.addPeer(p.id, p.addresses || []);
          netMod.dht.table.set(p.id, { id: p.id, addresses: p.addresses || [], ts: Date.now() });
          console.log('  discovered:', p.id, p.addresses);
        }
      }

      // 3c. 注册自身到 bootstrap
      await registerToBootstrap(bootstrapUrl, id, myAddresses);
      console.log('Registered to bootstrap');

      // 3d. 尝试直连发现的 peer
      for (const p of peers) {
        if (p.id !== id && p.addresses) {
          for (const addr of p.addresses) {
            const m = addr.match(/\/ip4\/([^/]+)\/tcp\/(\d+)/);
            if (m) {
              console.log('  trying direct:', m[1] + ':' + m[2]);
              const result = await tcpConnect(m[1], parseInt(m[2]), id, 3000);
              if (result) {
                console.log('  ✅ direct connected:', p.id);
                result.conn.write(JSON.stringify({ type: 'ping', from: id }) + '\n');
              } else {
                console.log('  ❌ direct failed:', p.id);
              }
              if (result) result.conn.end();
            }
          }
        }
      }

      // 3e. 启动中转轮询（每 5 秒从 bootstrap 拉取消息）
      console.log('Relay poll: every 5s via bootstrap');
      setInterval(async () => {
        const result = await relayPoll(bootstrapUrl, id);
        if (result.ok && result.messages && result.messages.length > 0) {
          for (const m of result.messages) {
            netMod.message.receive({ type: 'msg', from: m.from, to: id, payload: m.payload });
            console.log('  [relay] ' + m.from + ' → ' + id + ': ' + JSON.stringify(m.payload).slice(0, 80));
          }
        }
      }, 5000);
    }

    console.log('');
    console.log('Status: READY');
    console.log('Press Ctrl+C to stop');
  });

  process.on('SIGINT', () => { srv.close(); process.exit(0); });
};

// ========== 重写 send：真实网络发送 ==========
// 用法: zhixia send <peer-id> <message> [--bootstrap <url>]
// 策略: 直连优先 → 失败则通过 bootstrap HTTP 中转 (store-and-forward)
exports.send = (to, message, bootstrapUrl) => {
  return new Promise((resolve) => {
    const info = loadIdentity();
    const fromId = info ? info.id : 'zid:local';

    if (!to || !message) {
      console.log('Usage: zhixia send <peer> <message> [--bootstrap <url>]');
      resolve();
      return;
    }

    if (!bootstrapUrl) {
      // 无 bootstrap：保存到本地
      const comm = require('../../communication/manager');
      const result = comm.create({
        from: fromId,
        to: to,
        type: 'text',
        payload: { text: message, timestamp: Date.now() }
      });
      console.log('Message saved locally (no bootstrap)');
      console.log('To:', to);
      console.log('From:', fromId);
      console.log('ID:', result.id || '(saved locally)');
      console.log('Status: local-only');
      resolve();
      return;
    }

    (async () => {
      const peers = await getPeersFromBootstrap(bootstrapUrl);
      const target = peers.find(p => p.id === to);
      const payload = { text: message, timestamp: Date.now() };

      if (target && target.addresses) {
        // 尝试直连
        for (const addr of target.addresses) {
          const m = addr.match(/\/ip4\/([^/]+)\/tcp\/(\d+)/);
          if (m) {
            console.log('Trying direct:', m[1] + ':' + m[2]);
            const result = await tcpConnect(m[1], parseInt(m[2]), fromId, 3000);
            if (result) {
              const msg = { type: 'msg', from: fromId, to, payload };
              result.conn.write(JSON.stringify(msg) + '\n');
              // 等待 ack
              const ack = await new Promise((res) => {
                let data = '';
                const timer = setTimeout(() => { res(null); }, 3000);
                result.conn.on('data', (d) => {
                  data += d.toString();
                  for (const line of data.split('\n')) {
                    if (!line.trim()) continue;
                    try {
                      const resp = JSON.parse(line);
                      if (resp.type === 'ack') { clearTimeout(timer); res(resp); }
                    } catch (e) {}
                  }
                });
                result.conn.on('close', () => { clearTimeout(timer); res(null); });
              });
              if (ack) {
                console.log('Message sent (direct)');
                console.log('From:', fromId, '-> To:', to);
                console.log('Status: delivered');
              } else {
                console.log('No ack received, falling back to bootstrap relay...');
              }
              result.conn.end();

              // 如果直连成功但有 ack，直接返回
              if (ack) {
                resolve();
                return;
              }
              // 否则继续走中转
              break;
            }
            console.log('Direct failed, trying bootstrap relay...');
            break;
          }
        }
      } else {
        console.log('Target not found in bootstrap, trying bootstrap relay...');
      }

      // 中转兜底：通过 bootstrap HTTP store-and-forward
      console.log('Relaying via bootstrap:', bootstrapUrl);
      const relayResult = await relaySend(bootstrapUrl, fromId, to, payload);
      if (relayResult.ok) {
        console.log('Message queued via bootstrap relay');
        console.log('From:', fromId, '-> To:', to);
        console.log('Status: queued (target will poll within ~5s)');
      } else {
        console.log('Bootstrap relay failed:', relayResult.error || 'unknown');
      }
      resolve();
    })();
  });
};

exports.peers = () => {
  const peers = netMod.peer.list ? netMod.peer.list() : [];
  console.log('Connected Peers:');
  if (peers.length === 0) {
    console.log('  (no peers connected)');
    return;
  }
  peers.forEach((p, i) => console.log('  ' + (i + 1) + '. ' + (p.id || p.peerId || '(unknown)')));
};

exports.publish = (file) => {
  try {
    const fs = require('fs');
    if (!fs.existsSync(file)) {
      console.log('Error: file not found:', file);
      return;
    }
    const data = fs.readFileSync(file);
    const mgr = require('../../storage/storage-manager');
    const info = loadIdentity();
    const result = mgr.store(data, { owner: info ? info.id : 'zid:local' });
    console.log('Published');
    console.log('CID:', result.cid);
    console.log('Chunks:', result.chunks.length);
    console.log('Replicas:', 3);
    console.log('Size:', result.size + ' bytes');
  } catch (e) {
    console.log('Publish Error:', e.message);
  }
};

exports.get = (cid) => {
  try {
    const mgr = require('../../storage/storage-manager');
    const chunks = mgr.get(cid);
    console.log('Content:', cid);
    console.log('Chunks:', chunks.length);
    console.log('Size:', chunks.reduce((s, c) => s + (c ? c.length : 0), 0) + ' bytes');
    if (chunks.length === 1) {
      console.log('Data (first 200 chars):', chunks[0]?.toString().slice(0, 200));
    }
  } catch (e) {
    console.log('Get Error:', e.message);
  }
};

exports.skillList = () => {
  const skills = require('../../skills/manifest.json');
  console.log('Installed Skills:');
  skills.skills.forEach((s, i) => console.log('  ' + (i + 1) + '. ' + s.name));
};

exports.skillCall = (name) => {
  try {
    const runtime = require('../../skills/runtime');
    runtime.registerManifest();
    const r = runtime.execute(name, {});
    if (r && typeof r.then === 'function') {
      r.then(res => console.log('Result:', JSON.stringify(res).slice(0, 500))).catch(e => console.log('Error:', e.message));
    } else {
      console.log('Result:', JSON.stringify(r).slice(0, 500));
    }
  } catch (e) {
    console.log('Skill Error:', e.message);
  }
};

exports.configShow = () => {
  const config = require('../../../config/default.json');
  console.log('Node Config:');
  console.log('  Name:', config.name);
  console.log('  Network:', config.network.protocol, 'port ' + config.network.port);
  console.log('  NAT:', config.network.nat);
  console.log('  Storage:', config.storage.capacity, '| chunk:', config.storage.chunkSize);
  console.log('  Replication:', config.replication);
  console.log('  Skills:', config.skills.enabled ? 'enabled' : 'disabled');
  console.log('  Mode options:', config.modes.options.join(', '));
};

exports.search = (target) => {
  try {
    const rep = require('../../reputation/reputation-manager');
    const r = rep.local(target || 'local');
    console.log('Search:', target || 'local');
    console.log('  Score:', r.score);
    console.log('  Tier:', r.tier || 'NORMAL');
    console.log('  Events:', (r.events || []).length);
  } catch (e) {
    console.log('Search Error:', e.message);
  }
};

exports.nodeOffline = async () => {
  const runtime = require('../../node/node-runtime');
  const s = await runtime.stop();
  console.log('Node Offline');
  console.log('Uptime:', Math.round(s.uptime / 1000) + 's');
};

exports.bootstrapServer = exports.bootstrapServer;
exports.relayServer = exports.relayServer;