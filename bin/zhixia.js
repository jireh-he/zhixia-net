#!/usr/bin/env node
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

// tailcat 子命令走独立解析器（yargs strict 模式与 variadic positional 不兼容，
// 且 ato Node 16 上保持零 yargs 依赖路径）
if (process.argv[2] === 'tailcat') {
  const tc = require('../src/cli/commands/tailcat-cmd');
  tc.main(process.argv.slice(3));
  return;
}

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

  // ========== tailcat P2P 聊天 & 文件传输（第四传输层） ==========
  // 实际执行走 bin/zhixia.js 顶部的独立解析器（tailcat-cmd.main），这里只为 --help 展示
  .command({
    command: 'tailcat [sub] [args...]',
    describe: 'P2P chat & file transfer (tailcat engine: WireGuard + DERP NAT traversal)',
    builder: {},
    handler: () => {
      console.log('zhixia tailcat <sub> [args]');
      console.log('  server               起 P2P 聊天监听器（打印 tc 地址，连上后双向打字）');
      console.log('  recv [dir]           文件收件箱（write-only drop box，默认 ./zhixia-inbox）');
      console.log('  serve-files [dir] [--rw]  文件服务（files SFTP，默认只读）');
      console.log('  send <addr> <text>   一次性聊天消息发给对端 server');
      console.log('  send-file [-r] <files...> <addr>  发文件给对端 recv 收件箱');
      console.log('  get <addr> <remote> [local]  从对端 files 服务拉文件');
      console.log('  ls <addr> [path]     列对端目录（SFTP）');
      console.log('  ping <addr>          连通测试（DERP vs 直连）');
      console.log('  last                 显示本端最近记住的 tc 地址');
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
