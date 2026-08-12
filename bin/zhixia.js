#!/usr/bin/env node
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
         .option('relay', { describe: 'Relay node mode', type: 'boolean' }),
    handler: (argv) => {
      const mod = require('../src/cli/commands/cli-commands');
      mod.online(argv.storage ? 'storage' : (argv.relay ? 'relay' : (argv.mode || 'normal')), argv.port);
    }
  })

  .command({ command: 'peers', describe: 'List connected peers', builder: {}, handler: () => cmds.peers() })
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
    describe: 'Send message to peer',
    builder: (y) => y.positional('to', { describe: 'Target zid', type: 'string' })
         .positional('message', { describe: 'Message text', type: 'string' }),
    handler: (argv) => cmds.send(argv.to, argv.message)
  })

  .command({
    command: 'search <target>',
    describe: 'Search reputation/content',
    builder: (y) => y.positional('target', { describe: 'Search target', type: 'string' }),
    handler: (argv) => cmds.search(argv.target)
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
