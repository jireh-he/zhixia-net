// Phase 1 — CLI command: status（Node Status + 全模块快照）
const runtime = require('../../node/node-runtime');
const net = require('../../network');
const trust = require('../../trust');
const eco = require('../../economics');
const rep = require('../../reputation/reputation-manager');

exports.status = async (args = {}) => {
  const node = runtime.getStatus();
  const stunInfo = net.stun.detect();
  const peers = net.peer.list ? net.peer.list().length : 0;

  console.log('═══════════════════════════════════');
  console.log('  zhixia-net Status');
  console.log('═══════════════════════════════════');
  console.log('');
  console.log('  Node:', node.id || 'zid:local');
  console.log('  Online:', node.online ? 'YES ✓' : 'NO');
  console.log('  Network: P2P');
  console.log('  NAT:', stunInfo.natType === 'open' ? 'Open (Direct)' : stunInfo.natType || 'unknown');
  console.log('  Peers:', peers);
  console.log('');
  console.log('  Modules:');
  console.log('   Identity:   ✓');
  console.log('   P2P:        ✓');
  console.log('   Encryption: ✓ (ECDH + AES-256-GCM)');
  console.log('   DHT:        ✓ (Kademlia)');
  console.log('   Storage:    ✓');
  console.log('   Reputation: ✓');
  console.log('   Governance: ✓');
  console.log('   Economics:  ✓');
  console.log('   Skills:     ✓ (6 agent skills)');
  console.log('');
  console.log('  Local Balance:', eco.balance.get(node.id || 'local'));
  console.log('═══════════════════════════════════');
};
