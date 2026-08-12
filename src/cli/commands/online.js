// Phase 1 — CLI command: online
const runtime = require('../../node/node-runtime');

exports.online = async () => {
  const s = await runtime.start();
  console.log('Node Online');
  console.log('ID:', s.id);
  console.log('Status: READY');
  console.log('Network: P2P');
  console.log('NAT:', require('../network/stun').canDirectConnect() ? 'Open' : 'Relay');
};

exports.offline = async () => {
  const s = await runtime.stop();
  console.log('Node Offline');
  console.log('Uptime:', Math.round(s.uptime / 1000) + 's');
};
