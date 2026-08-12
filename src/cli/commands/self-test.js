// Phase 26 — zhixia test: 一键自检
const crypto = require('crypto');
const localStore = require('../../storage/local-store');
const mgr = require('../../storage/storage-manager');
const comm = require('../../communication/manager');
const rep = require('../../reputation/reputation-manager');
const net = require('../../network');
const dht = require('../../network/dht');
const sk = require('../../skills');

const tests = [
  {
    name: 'Identity',
    fn: () => {
      const info = localStore.load('identity');
      if (!info || !info.id) {
        const id = 'zid:' + crypto.randomBytes(4).toString('hex');
        localStore.save('identity', { id, username: 'local', created: Date.now() });
      }
      return localStore.load('identity');
    }
  },
  {
    name: 'Network',
    fn: () => {
      const stun = net.stun.detect();
      const nat = net.nat.status();
      return { nat: stun.natType, strategy: nat.strategy };
    }
  },
  {
    name: 'Discovery',
    fn: () => {
      const bId = 'zid:' + crypto.randomBytes(4).toString('hex');
      dht.table.set(bId, { id: bId, address: '127.0.0.1:9001' });
      const found = dht.table.get(bId);
      if (!found) throw new Error('Discovery failed');
      return found;
    }
  },
  {
    name: 'Message',
    fn: () => {
      const aId = (localStore.load('identity') || {}).id || 'zid:local';
      const bId = 'zid:' + crypto.randomBytes(4).toString('hex');
      comm.create({ from: aId, to: bId, type: 'text', payload: { text: 'self-test', timestamp: Date.now() } });
      return { ok: true };
    }
  },
  {
    name: 'Storage',
    fn: () => {
      const data = Buffer.from('zhixia-net self-test data');
      const result = mgr.store(data);
      const retrieved = mgr.get(result.cid);
      if (!retrieved || retrieved.length === 0) throw new Error('Storage roundtrip failed');
      const content = Buffer.concat(retrieved);
      if (!content.toString().includes('zhixia-net')) throw new Error('Content mismatch');
      return { cid: result.cid, size: content.length };
    }
  },
  {
    name: 'Skill Runtime',
    fn: () => {
      const rt = sk.runtime;
      rt.registerManifest();
      if (rt.list().length < 4) throw new Error('Skill Runtime: not enough skills');
      const rep = require('../../reputation/reputation-manager');
      const r = rep.local('local');
      if (r.score === undefined) throw new Error('API reputation failed');
      return { skills: rt.list().length, api: true };
    }
  }
];

function runTests() {
  let ok = 0, fail = 0;
  console.log('');
  console.log('Zhixia Self Test');
  console.log('─────────────────');
  for (const test of tests) {
    try {
      const result = test.fn();
      console.log('✓ ' + test.name + ' — ' + JSON.stringify(result).slice(0, 80));
      ok++;
    } catch (e) {
      console.log('✗ ' + test.name + ' — ' + e.message);
      fail++;
    }
  }
  console.log('─────────────────');
  console.log((fail === 0 ? 'ALL TESTS PASSED' : ok + '/' + tests.length + ' passed'));
  console.log('');
  return { ok, fail, total: tests.length };
}

module.exports = { runTests };
