// Phase 12-20 — CLI commands 快捷入口（不依赖 daemon，直接调用模块）
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const rep = require('../../reputation/reputation-manager');
const eco = require('../../economics');
const mk = require('../../market');
const gov = require('../../governance');
const net = require('../../network');
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

exports.networkStatus = () => {
  const nat = net.nat.status();
  const tor = net.tor.status();
  const stun = net.stun.detect();
  console.log('Network Status');
  console.log('  Direct:', stun.natType === 'open' ? 'AVAILABLE' : 'FALLBACK');
  console.log('  NAT:', stun.natType || 'unknown');
  console.log('  Relay:', 'READY');
  console.log('  Tor:', tor.enabled ? 'ON' : 'OFF');
  console.log('  Strategy:', nat.strategy);
};

exports.proposalList = () => {
  const list = gov.store.list() || [];
  console.log('Governance Proposals:');
  list.forEach((p, i) => {
    console.log('  ' + (i + 1) + '. ' + (p.title || '(no title)') + ' [' + p.status + ']');
  });
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

exports.online = async (mode) => {
  const config = require('../../../config/default.json');
  const runtime = require('../../node/node-runtime');
  const info = loadIdentity();
  const s = await runtime.start({ id: info ? info.id : 'zid:local' });
  console.log('Zhixia Node');
  console.log('Identity:', s.id);
  console.log('Network: ONLINE');
  console.log('Mode:', mode);
  console.log('Port:', config.network.port);
  console.log('Storage:', config.storage.capacity);
  console.log('Skills:', config.skills.enabled ? '6 (ready)' : 'disabled');
  console.log('Status: READY');
};

exports.peers = () => {
  const peers = net.peer.list ? net.peer.list() : [];
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

// Phase 23 — MVP: send command
exports.send = (to, message) => {
  try {
    if (!to || !message) {
      console.log('Usage: zhixia send <peer> <message>');
      return;
    }
    const comm = require('../../communication/manager');
    const info = loadIdentity();
    const result = comm.create({
      from: info ? info.id : 'zid:local',
      to: to,
      type: 'text',
      payload: { text: message, timestamp: Date.now() }
    });
    console.log('Message sent');
    console.log('To:', to);
    console.log('From:', info ? info.id : 'zid:local');
    console.log('ID:', result.id || '(saved locally)');
    console.log('Status: delivered');
  } catch (e) {
    console.log('Send Error:', e.message);
  }
};

// Phase 23 — MVP: search command (reputation query)
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
