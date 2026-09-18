#!/usr/bin/env node
// 注意：yargs 延迟加载（MVP 层才用）。P2P 顶层命令（key/book/chat/inbox/
// files/send-file/last/ls/ping/send/get→P2P）零 npm 依赖，纯 stdlib + tailcat
// 静态二进制 —— fresh clone 不跑 npm install 也能用 P2P（见 skill/zhixia-p2p）。

// ========== P2P 顶层命令（第四传输层，不套中间层） ==========
// P2P 专有命令（与 MVP 层不撞名）直接走独立解析器
// （yargs strict 模式与 variadic positional 不兼容，且 ato Node 16 上保持零 yargs 依赖路径）
const P2P_OWN = ['key', 'book', 'chat', 'inbox', 'files', 'listen', 'card', 'send-file', 'last', 'ls', 'ping'];
if (P2P_OWN.includes(process.argv[2])) {
  const p2p = require('../src/cli/commands/p2p-cmd');
  p2p.main(process.argv.slice(2));
  return; // CJS 顶层 return 结束模块，事件循环自然收尾（监听类命令靠活跃句柄保活，不能 process.exit）
}
// send / get 与 MVP 层同名 → 按目标形态路由：tc 地址/通讯录昵称 → P2P；zid/CID → MVP
if (process.argv[2] === 'send' || process.argv[2] === 'get') {
  const p2p = require('../src/cli/commands/p2p-cmd');
  const rest = process.argv.slice(3);
  const wantP2P = process.argv[2] === 'send' ? p2p.wantP2PSend(rest) : p2p.wantP2PGet(rest);
  if (wantP2P) {
    p2p.main([process.argv[2]].concat(rest));
    return;
  }
  // 否则落到下方 yargs（MVP 的 send <zid> <msg> / get <cid>）
}
// 旧层级名提示（link / tailcat 均已撤掉，命令直接挂顶层）
if (process.argv[2] === 'link' || process.argv[2] === 'tailcat') {
  console.log('[zhixia] "' + process.argv[2] + '" 这一层已撤掉：命令直接挂顶层。');
  console.log('        例: zhixia send 小美 "hi" / zhixia book add 小美 <tc地址> / zhixia key');
  process.exit(0);
}
// P2P 帮助（也走独立解析器，零 npm 依赖）
if (process.argv[2] === 'p2p-help' || (process.argv[2] === 'help' && process.argv[3] === 'p2p')) {
  require('../src/cli/commands/p2p-cmd').main(['help']);
  return;
}

// ---- P2P 分支之外 → MVP 层（yargs 在此才加载） ----
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

const cmds = require('../src/cli/commands/cli-commands');
const statusCmd = require('../src/cli/commands/status');

yargs(hideBin(process.argv))
  .scriptName('zhixia')
  .usage('$0 <cmd> [args]')
  .version('1.1.0')
  .demandCommand()
  .strict()

  .command('init [name]', 'Create new identity',
    (y) => y.positional('name', { describe: 'Username', type: 'string', default: 'anonymous' }),
    (argv) => cmds.init({ name: argv.name })
  )

  .command('identity show', 'Show current identity', {},
    () => cmds.identityShow()
  )

  .command('reputation [zid]', 'View reputation score',
    (y) => y.positional('zid', { describe: 'Target zid', type: 'string' }),
    (argv) => cmds.reputation({ id: argv.zid || 'local' })
  )

  .command('balance [zid]', 'View balance',
    (y) => y.positional('zid', { describe: 'Target zid', type: 'string' }),
    (argv) => cmds.balance({ id: argv.zid || 'local' })
  )

  .command('network status', 'Network status (NAT/Relay/Tor)', {},
    () => cmds.networkStatus()
  )

  .command('proposal list', 'List governance proposals', {},
    () => cmds.proposalList()
  )

  .command('market list [type]', 'List market resources',
    (y) => y.positional('type', { describe: 'Resource type', type: 'string' }),
    (argv) => cmds.marketList({ type: argv.type })
  )

  .command('storage status', 'Storage status', {},
    () => cmds.storageStatus()
  )

  .command('node online', 'Start node', {},
    () => cmds.nodeOnline()
  )

  .command('node offline', 'Stop node', {},
    () => cmds.nodeOffline()
  )

  .command('status', 'Full status snapshot', {},
    () => statusCmd.status()
  )

  .command({
    command: 'online',
    describe: 'Start node (modes: normal/storage/relay)',
    builder: (y) => y.option('mode', { describe: 'Node mode', type: 'string', default: 'normal' })
         .option('port', { describe: 'Port', type: 'number' })
         .option('storage', { describe: 'Storage node mode', type: 'boolean' })
         .option('bootstrap', { describe: 'Bootstrap server URL (e.g. 59.77.42.202:9001)', type: 'string' }),
    handler: (argv) => {
      const mod = require('../src/cli/commands/cli-commands');
      const mode = argv.storage ? 'storage' : (argv.mode || 'normal');
      mod.online(mode, argv.port, argv.bootstrap);
    }
  })

  .command('peers', 'List connected peers', {}, () => cmds.peers())
  .command({
    command: 'publish <file>', describe: 'Publish file to distributed storage',
    builder: (y) => y.positional('file', { describe: 'File path', type: 'string' }),
    handler: (argv) => cmds.publish(argv.file)
  })
  .command({
    command: 'get <cid>', describe: 'Get content by CID',
    builder: (y) => y.positional('cid', { describe: 'Content CID', type: 'string' }),
    handler: (argv) => cmds.get(argv.cid)
  })
  .command({ command: 'skills', describe: 'List installed agent skills', builder: {}, handler: () => cmds.skillList() })
  .command({
    command: 'skill <name>', describe: 'Call agent skill by name',
    builder: (y) => y.positional('name', { describe: 'Skill name', type: 'string' }),
    handler: (argv) => cmds.skillCall(argv.name)
  })
  .command({ command: 'config', describe: 'Show node config', builder: {}, handler: () => cmds.configShow() })

  .command({ command: 'test', describe: 'Run self-test (Identity/Network/Discovery/Message/Storage/Skill)', builder: {}, handler: () => {
    const { runTests } = require('../src/cli/commands/self-test');
    const r = runTests();
    process.exit(r.fail > 0 ? 1 : 0);
  }})

  .command({
    command: 'send <to> <message>',
    describe: 'Send message to peer (supports --bootstrap/--relay for internet P2P)',
    builder: (y) => y.positional('to', { describe: 'Target zid', type: 'string' })
         .positional('message', { describe: 'Message text', type: 'string' })
         .option('bootstrap', { describe: 'Bootstrap server URL', type: 'string' })
         .option('relay', { describe: 'Relay server URL (for NAT fallback)', type: 'string' }),
    handler: (argv) => cmds.send(argv.to, argv.message, argv.bootstrap, argv.relay)
  })

  .command({
    command: 'search <target>',
    describe: 'Search reputation/content',
    builder: (y) => y.positional('target', { describe: 'Search target', type: 'string' }),
    handler: (argv) => cmds.search(argv.target)
  })

  .command({
    command: 'bootstrap-server',
    describe: 'Start bootstrap server (peer discovery, BT tracker)',
    builder: (y) => y.option('port', { describe: 'HTTP port', type: 'number', default: 9001 })
         .option('host', { describe: 'Bind address', type: 'string', default: '0.0.0.0' }),
    handler: (argv) => cmds.bootstrapServer(argv.port, argv.host)
  })

  // ========== P2P 顶层命令：聊天 & 文件传输（第四传输层，不套中间层） ==========
  // 实际执行走 bin/zhixia.js 顶部的独立解析器（p2p-cmd.main + send/get 路由），这里只为 --help 展示
  .command({
    command: 'p2p-help',
    describe: 'P2P 顶层命令速查：key / book / chat / inbox / files / listen / send / send-file / get / ls / ping / last',
    builder: {},
    handler: () => {
      const p2p = require('../src/cli/commands/p2p-cmd');
      p2p.main(['help']);
    }
  })

  .command({ command: 'version', describe: 'Show version + MVP status', builder: {}, handler: () => {
    const mvp = require('../src/mvp');
    console.log('zhixia-net ' + mvp.version);
    console.log('');
    console.log('Core:');
    Object.entries(mvp.core).forEach(([k, v]) => console.log('  [' + (v.ready ? '✓' : '✗') + '] ' + v.desc + ' (' + k + ')'));
    console.log('');
    console.log('Deferred (plugin):');
    Object.entries(mvp.deferred).forEach(([k, v]) => console.log('  [ ] ' + v.desc + ' (' + k + ')'));
  }})

  .help()
  .argv;
