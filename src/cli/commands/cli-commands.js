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

exports.nodeOffline = async () => {
  const runtime = require('../../node/node-runtime');
  const s = await runtime.stop();
  console.log('Node Offline');
  console.log('Uptime:', Math.round(s.uptime / 1000) + 's');
};
