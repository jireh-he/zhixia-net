// 集成测试：STUN 检测 → 策略选择 → 打洞 → Bootstrap Relay 全链路
// 运行: node --no-warnings _test_v12_integration.js
const assert = require('assert');
const http = require('http');

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ ' + name + (detail ? ': ' + detail : '')); }
}

async function main() {
  console.log('═══ v1.2 集成测试 ═══\n');

  // ── Test 1: STUN 检测模块可加载 ──
  console.log('[1] STUN 模块加载');
  const stun = require('./src/network/stun');
  check('stun module loaded', !!stun && typeof stun.detect === 'function');
  check('stun._buildRequest', typeof stun._buildRequest === 'function');
  const req = stun._buildRequest(false);
  check('stun request is 20 bytes', req.length === 20, 'got ' + req.length);
  check('stun magic cookie', req.readUInt32BE(4) === 0x2112A442);

  // ── Test 2: NAT 探测（本地，不依赖网络） ──
  console.log('\n[2] NAT 本地探测');
  const natProbe = require('./src/network/nat-probe');
  const nat = natProbe.detect();
  check('detect returns object', !!nat);
  check('detect has nat field', !!nat.nat);
  check('detect has strategy', !!nat.strategy);
  check('nat is one of known', ['open-ipv6','open-ipv4','behind-nat'].includes(nat.nat), nat.nat);
  check('strategy is one of known',
    ['ipv6-direct','public-ipv4-direct','hole-punching'].includes(nat.strategy), nat.strategy);

  // ── Test 3: Hole Punch 模块 ──
  console.log('\n[3] Hole Punch 模块');
  const holePunch = require('./src/network/hole-punch');
  check('holePunch module loaded', !!holePunch && typeof holePunch.punch === 'function');
  check('holePunch listen', typeof holePunch.listen === 'function');
  check('holePunch punchOnce', typeof holePunch.punchOnce === 'function');
  check('holePunch punchPeriodic', typeof holePunch.punchPeriodic === 'function');
  check('holePunch close', typeof holePunch.close === 'function');

  // ── Test 4: Hole Punch 双向打洞（UDP 环路测试） ──
  console.log('\n[4] Hole Punch 双向打洞（UDP 环路）');
  const hp = require('./src/network/hole-punch');
  const sockInfo = await hp.listen(0);
  check('hole-punch listening', sockInfo.port > 0, 'port=' + sockInfo.port);

  // 自己给自己打洞（验证 punchOnce 协议）
  const punchResult = await hp.punchOnce('127.0.0.1', sockInfo.port, 'zid:A', 'zid:B', 2000);
  check('punchOnce loopback ok', punchResult.ok === true, JSON.stringify(punchResult));
  check('punchOnce strategy=fullcone', punchResult.strategy === 'fullcone-direct');
  check('punchOnce myPort set', typeof punchResult.myPort === 'number');

  // punchPeriodic 也测一下
  const periodResult = await hp.punchPeriodic('127.0.0.1', sockInfo.port, 'zid:C', 'zid:D', 100, 3);
  check('punchPeriodic loopback ok', periodResult.ok === true, JSON.stringify(periodResult));
  check('punchPeriodic strategy=restrict', periodResult.strategy === 'restrict-punching');

  // punch() 统一入口
  const punchAuto = await hp.punch('zid:D', '/ip4/127.0.0.1/tcp/' + sockInfo.port, 'zid:C', 'FullCone');
  check('punch() FullCone ok', punchAuto.ok === true, JSON.stringify(punchAuto));

  // Symmetric NAT 应该返回 bootstrap-relay
  const punchSym = await hp.punch('zid:E', '/ip4/127.0.0.1/tcp/' + sockInfo.port, 'zid:F', 'SymmetricNAT');
  check('punch() Symmetric → relay', punchSym.ok === false && punchSym.strategy === 'bootstrap-relay');

  hp.close();

  // ── Test 5: Connection Strategy 三模式选择 ──
  console.log('\n[5] Connection Strategy 选择逻辑');
  const cs = require('./src/network/connection-strategy');
  check('connectionStrategy module loaded', !!cs && typeof cs.connect === 'function');
  check('select FullCone', cs.select('fullcone-direct', ['/ip4/1.2.3.4/tcp/1234']) === 'fullcone-punch');
  check('select Restrict', cs.select('restrict-punching', ['/ip4/1.2.3.4/tcp/1234']) === 'restrict-punch');
  check('select Symmetric → relay', cs.select('symmetric-nat', ['/ip4/1.2.3.4/tcp/1234']) === 'bootstrap-relay');
  check('select IPv6 direct', cs.select('open-ipv6', ['/ip6/::1/tcp/1234']) === 'ipv6-direct');
  check('select behind-nat → hole-punch', cs.select('behind-nat', ['/ip4/1.2.3.4/tcp/1234']) === 'hole-punch');

  // ── Test 6: Bootstrap Relay 端到端 ──
  console.log('\n[6] Bootstrap Relay 端到端');
  const bootstrap = require('./src/network/bootstrap');
  const bport = 19099;
  bootstrap.listen(bport, '127.0.0.1');
  await new Promise(r => setTimeout(r, 300));

  // 注册 peer
  bootstrap.register('zid:A', ['/ip4/127.0.0.1/tcp/1234']);
  bootstrap.register('zid:B', ['/ip4/127.0.0.1/tcp/5678']);
  check('bootstrap registered 2 peers', bootstrap.peers.size === 2);

  // 存消息
  const stored = bootstrap.storeMessage('zid:A', 'zid:B', { text: 'hello relay' });
  check('storeMessage ok', stored === true);

  // 轮询取走
  const polled = bootstrap.pollMessages('zid:B');
  check('pollMessages got 1', polled.length === 1, 'got ' + polled.length);
  check('pollMessages from=A', polled[0].from === 'zid:A');
  check('pollMessages payload match', polled[0].payload.text === 'hello relay');

  // 再取一次应该空
  const polled2 = bootstrap.pollMessages('zid:B');
  check('pollMessages empty after read', polled2.length === 0);

  // HTTP API 测试
  function httpPost(path, body) {
    return new Promise((resolve) => {
      const req = http.request({
        hostname: '127.0.0.1', port: bport, path,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
      }, (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
      });
      req.on('error', () => resolve(null));
      req.setTimeout(3000, () => { req.destroy(); resolve(null); });
      req.write(body);
      req.end();
    });
  }
  function httpGet(path) {
    return new Promise((resolve) => {
      const req = http.get({ hostname: '127.0.0.1', port: bport, path }, (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
      });
      req.on('error', () => resolve(null));
      req.setTimeout(3000, () => { req.destroy(); resolve(null); });
    });
  }

  const regResp = await httpPost('/register', JSON.stringify({ id: 'zid:C', addresses: ['/ip4/10.0.0.1/tcp/9999'] }));
  check('HTTP /register ok', regResp && regResp.ok === true, JSON.stringify(regResp));

  const peersResp = await httpGet('/peers');
  check('HTTP /peers returns 3', peersResp && peersResp.peers && peersResp.peers.length === 3, 'count=' + (peersResp && peersResp.peers ? peersResp.peers.length : '?'));

  const relaySend = await httpPost('/relay/send', JSON.stringify({ from: 'zid:A', to: 'zid:C', payload: { text: 'http relay' } }));
  check('HTTP /relay/send ok', relaySend && relaySend.ok === true, JSON.stringify(relaySend));

  const relayPoll = await httpPost('/relay/poll', JSON.stringify({ id: 'zid:C' }));
  check('HTTP /relay/poll got 1', relayPoll && relayPoll.messages && relayPoll.messages.length === 1, JSON.stringify(relayPoll));
  check('HTTP relay payload match', relayPoll && relayPoll.messages && relayPoll.messages[0].payload.text === 'http relay');

  bootstrap.close();

  // ── Test 7: Message Manager relay 兜底 ──
  console.log('\n[7] Message Manager relay 兜底');
  const msg = require('./src/network/message');
  check('message module loaded', !!msg && typeof msg.send === 'function');
  check('message has setBootstrap', typeof msg.setBootstrap === 'function');
  check('message has pollMessages', typeof msg.pollMessages === 'function');

  // ── Test 8: Peer Manager 集成 ──
  console.log('\n[8] Peer Manager 集成');
  const pm = require('./src/network/peer-manager');
  check('peerManager module loaded', !!pm && typeof pm.connectTo === 'function');
  check('peerManager has detectNat', typeof pm.detectNat === 'function');
  check('peerManager has init', typeof pm.init === 'function');

  const initResult = pm.init('zid:local', 9000);
  check('peerManager init ok', initResult.id === 'zid:local');
  check('peerManager has addresses', initResult.addresses.length > 0);
  check('peerManager nat info', !!initResult.nat);

  const pmStatus = pm.status();
  check('peerManager status has nat', !!pmStatus.nat);
  check('peerManager status has peers', Array.isArray(pmStatus.peers));

  // ── Test 9: CLI 模块无崩溃 ──
  console.log('\n[9] CLI 模块无崩溃');
  let cliErr = null;
  try {
    require('./src/cli/commands/cli-commands');
  } catch (e) { cliErr = e; }
  check('cli-commands loads without error', !cliErr, cliErr ? cliErr.message : '');

  let statusErr = null;
  try {
    require('./src/cli/commands/status');
  } catch (e) { statusErr = e; }
  check('status cmd loads without error', !statusErr, statusErr ? statusErr.message : '');

  // ── Test 10: STUN 真实检测（如网络可达，5s 超时） ──
  console.log('\n[10] STUN 真实检测（网络可达才跑）');
  const stunResult = await Promise.race([
    stun.detect(),
    new Promise(r => setTimeout(() => r(null), 5000))
  ]).catch(() => null);
  if (stunResult && stunResult.externalIP) {
    check('STUN detected external IP', !!stunResult.externalIP, stunResult.externalIP);
    check('STUN detected NAT type', !!stunResult.nat, stunResult.nat);
    console.log('    → NAT=' + stunResult.nat + ', IP=' + stunResult.externalIP + ':' + stunResult.externalPort);
  } else {
    console.log('    → STUN 不可达（网络受限），跳过');
  }

  // ── 总结 ──
  console.log('\n═══ 结果 ═══');
  console.log('  Passed: ' + passed);
  console.log('  Failed: ' + failed);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });