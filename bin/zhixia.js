#!/usr/bin/env node
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const cmds = require('../src/cli/commands/cli-commands');
const statusCmd = require('../src/cli/commands/status');

yargs(hideBin(process.argv))
  .scriptName('zhixia')
  .usage('$0 <cmd> [args]')
  .version('0.6.4')
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

  .help()
  .argv;
