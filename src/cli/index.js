#!/usr/bin/env node
// Layer 4: CLI Entry Point

const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const { ZhixiaCLI } = require('./commands');
const bus = require('../core/command-bus');

// 注册身份/资料命令（v0.3.1.2）
require('./commands/user');
require('./commands/profile');
// 注册通讯层命令（v0.3.2）
require('../communication/commands');
// 注册内容层命令（v0.3.3）
require('../content/commands');
const pino = require('pino');

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const cli = new ZhixiaCLI({ logger });

process.on('SIGINT', () => { cli.stop(); process.exit(0); });
process.on('SIGTERM', () => { cli.stop(); process.exit(0); });

function outResult(data) {
  console.log(JSON.stringify({ type: 'result', data }));
}

function outEvent(event, payload) {
  console.log(JSON.stringify({ type: 'event', event, payload }));
}

function outError(code, message) {
  console.log(JSON.stringify({ type: 'error', code, message }));
}

yargs(hideBin(process.argv))
  .scriptName('zhixia')
  .usage('$0 <cmd> [args]')
  .option('yes', { type: 'boolean', default: false, describe: '跳过敏感操作确认' })
  .option('topic', { type: 'string', describe: '指定 Topic' })

  .command({
    command: 'join <topic_name>',
    describe: '加入 P2P Topic',
    builder: (yargs) => yargs.positional('topic_name', { describe: 'Topic 名称', type: 'string' }),
    handler: async (argv) => {
      try {
        const result = await cli.join(argv.topic_name, { yes: argv.yes });
        outResult(result);
      } catch (e) {
        outError('JOIN_FAILED', e.message);
        process.exit(1);
      }
    }
  })

  .command({
    command: 'leave',
    describe: '退出当前 Topic',
    handler: async () => {
      try {
        const result = await cli.leave();
        outResult(result);
      } catch (e) {
        outError('LEAVE_FAILED', e.message);
        process.exit(1);
      }
    }
  })

  .command({
    command: 'peers',
    describe: '列出已连接的 Peer',
    handler: async () => {
      try {
        const result = await cli.listPeers();
        outResult(result);
      } catch (e) {
        outError('LIST_PEERS_FAILED', e.message);
        process.exit(1);
      }
    }
  })

  .command({
    command: 'send <pubkey> <message>',
    describe: '向指定 Peer 发送文本消息',
    builder: (yargs) => yargs
      .positional('pubkey', { describe: '目标 Peer 公钥', type: 'string' })
      .positional('message', { describe: '消息内容', type: 'string' }),
    handler: async (argv) => {
      try {
        const result = await cli.send(argv.pubkey, argv.message);
        outResult(result);
      } catch (e) {
        outError('SEND_FAILED', e.message);
        process.exit(1);
      }
    }
  })

  .command({
    command: 'send-file <pubkey> <file_path>',
    describe: '向指定 Peer 发送文件',
    builder: (yargs) => yargs
      .positional('pubkey', { describe: '目标 Peer 公钥', type: 'string' })
      .positional('file_path', { describe: '本地文件路径', type: 'string' }),
    handler: async (argv) => {
      try {
        const result = await cli.sendFile(argv.pubkey, argv.file_path, { yes: argv.yes });
        outResult(result);
      } catch (e) {
        outError('SEND_FILE_FAILED', e.message);
        process.exit(1);
      }
    }
  })

  .command({
    command: 'disconnect <pubkey>',
    describe: '断开指定 Peer',
    builder: (yargs) => yargs.positional('pubkey', { describe: 'Peer 公钥', type: 'string' }),
    handler: async (argv) => {
      try {
        const result = await cli.disconnect(argv.pubkey);
        outResult(result);
      } catch (e) {
        outError('DISCONNECT_FAILED', e.message);
        process.exit(1);
      }
    }
  })

  .command({
    command: 'events',
    describe: '监听 P2P 事件流（前台模式）',
    handler: async () => {
      // 所有事件已在 ZhixiaCLI._processInboundEvent 中消毒
      cli.on('peer_connect', (payload) => outEvent('peer_connect', payload));
      cli.on('peer_disconnect', (payload) => outEvent('peer_disconnect', payload));
      cli.on('peer_message', (payload) => outEvent('peer_message', payload));
      cli.on('peer_blob', (payload) => outEvent('peer_blob', payload));
      cli.on('peer_error', (payload) => outEvent('peer_error', payload));
      await cli.startEvents();
    }
  })

  .command({
    command: 'stats',
    describe: '查看消毒层统计',
    handler: async () => {
      const stats = cli.getSanitizerStats();
      outResult({ sanitizer_stats: stats });
    }
  })

  .command({
    command: 'doctor',
    describe: '诊断工具',
    handler: async () => {
      const stats = cli.getSanitizerStats();
      console.error('✓ 智侠网诊断工具');
      console.error(`  版本: 0.2.0`);
      console.error(`  Node.js: ${process.version}`);
      console.error(`  平台: ${process.platform}`);
      console.error(`  消毒层统计: 总处理 ${stats.totalProcessed}, 清洁 ${stats.clean}, 可疑 ${stats.suspicious}, 拦截 ${stats.rejected}`);
      outResult({ ok: true, version: '0.2.0', node: process.version, platform: process.platform, stats });
    }
  })

  .command({
    command: 'user:create',
    describe: '创建新身份（生成 ed25519 密钥对）',
    handler: async () => {
      try {
        const result = await bus.execute({ action: 'user.create' });
        console.error('✓ User created');
        outResult({ id: result.id, publicKey: result.publicKey, createdAt: result.createdAt });
      } catch (e) {
        outError('CREATE_FAILED', e.message);
        process.exit(1);
      }
    }
  })

  .command({
    command: 'user:info',
    describe: '查看当前身份',
    handler: async () => {
      try {
        const result = await bus.execute({ action: 'user.info' });
        outResult(result);
      } catch (e) {
        outError('INFO_FAILED', e.message);
        process.exit(1);
      }
    }
  })

  .command({
    command: 'profile:set',
    describe: '设置用户资料',
    builder: (yargs) => yargs
      .option('name', { type: 'string', describe: '用户名' })
      .option('description', { type: 'string', describe: '简介' }),
    handler: async (argv) => {
      try {
        const data = {};
        if (argv.name) data.username = argv.name;
        if (argv.description) data.description = argv.description;
        const result = await bus.execute({ action: 'profile.update', data });
        outResult(result);
      } catch (e) {
        outError('PROFILE_SET_FAILED', e.message);
        process.exit(1);
      }
    }
  })

  .command({
    command: 'profile:show',
    describe: '查看用户资料',
    handler: async () => {
      try {
        const result = await bus.execute({ action: 'profile.show' });
        outResult(result);
      } catch (e) {
        outError('PROFILE_SHOW_FAILED', e.message);
        process.exit(1);
      }
    }
  })

  .command({
    command: 'network:peers',
    describe: '查看在线用户身份',
    handler: async () => {
      try {
        const ps = require('../storage/peer-store');
        const peers = ps.list();
        outResult({ peers });
      } catch (e) {
        outError('PEERS_FAILED', e.message);
        process.exit(1);
      }
    }
  })

  .command({
    command: 'message:send <to> <text>',
    describe: '发送消息给用户（通过P2P传输）',
    builder: (yargs) => yargs
      .positional('to', { describe: '目标用户 zid', type: 'string' })
      .positional('text', { describe: '消息内容', type: 'string' }),
    handler: async (argv) => {
      try {
        const transport = require('../communication/transport');
        // 注入 sender: 通过 daemon send_json
        transport.setSender(async (frame) => {
          const result = await cli.sendCmd('send_json', {
            peer_pubkey: frame.peer_pubkey,
            payload: frame.payload
          });
          return result;
        });
        // 注入 zid → pubkey 查找
        transport.setLookup(async (zid) => {
          const result = await cli.sendCmd('find_peer_by_zid', { zid });
          return result && result.peer_pubkey ? result.peer_pubkey : null;
        });

        const result = await bus.execute({ action: 'message.create', to: argv.to, text: argv.text });
        if (!result.send.ok) {
          console.error('[MSG] sent offline, saved as pending. Will retry when user comes online.');
        }
        outResult(result);
      } catch (e) {
        outError('MSG_SEND_FAILED', e.message);
        process.exit(1);
      }
    }
  })

  .command({
    command: 'message:history',
    describe: '查看所有消息历史',
    builder: (yargs) => yargs.option('limit', { type: 'number', default: 50 }),
    handler: async (argv) => {
      try {
        const result = await bus.execute({ action: 'message.history', limit: argv.limit });
        outResult(result);
      } catch (e) {
        outError('MSG_HISTORY_FAILED', e.message);
        process.exit(1);
      }
    }
  })

  .command({
    command: 'message:inbox',
    describe: '查看收件箱',
    builder: (yargs) => yargs.option('limit', { type: 'number', default: 50 }),
    handler: async (argv) => {
      try {
        const result = await bus.execute({ action: 'message.inbox', limit: argv.limit });
        outResult(result);
      } catch (e) {
        outError('MSG_INBOX_FAILED', e.message);
        process.exit(1);
      }
    }
  })

  .command({
    command: 'message:outbox',
    describe: '查看发送箱',
    builder: (yargs) => yargs.option('limit', { type: 'number', default: 50 }),
    handler: async (argv) => {
      try {
        const result = await bus.execute({ action: 'message.outbox', limit: argv.limit });
        outResult(result);
      } catch (e) {
        outError('MSG_OUTBOX_FAILED', e.message);
        process.exit(1);
      }
    }
  })

  .command({
    command: 'security:status',
    describe: '查看安全状态',
    handler: async () => {
      try {
        const result = await bus.execute({ action: 'security.status' });
        outResult(result);
      } catch (e) {
        outError('SEC_STATUS_FAILED', e.message);
        process.exit(1);
      }
    }
  })

  .command({
    command: 'key:exchange',
    describe: '生成或交换 X25519 加密密钥',
    builder: (yargs) => yargs
      .option('peerPub', { type: 'string', describe: '对方 X25519 公钥(PEM)' })
      .option('secret', { type: 'string', describe: '直接提供共享密钥(hex)' }),
    handler: async (argv) => {
      try {
        const result = await bus.execute({ action: 'key.exchange', peerPublicKey: argv.peerPub, secret: argv.secret });
        outResult(result);
      } catch (e) {
        outError('KEY_EXCHANGE_FAILED', e.message);
        process.exit(1);
      }
    }
  })

  .command({
    command: 'message:secure <to> <text>',
    describe: '发送端到端加密消息',
    builder: (yargs) => yargs
      .positional('to', { describe: '目标用户 zid', type: 'string' })
      .positional('text', { describe: '消息内容', type: 'string' })
      .option('secret', { type: 'string', describe: '共享密钥(hex)', demandOption: true }),
    handler: async (argv) => {
      try {
        const result = await bus.execute({
          action: 'message.secureSend',
          to: argv.to, text: argv.text, secret: argv.secret
        });
        outResult(result);
      } catch (e) {
        outError('MSG_SECURE_FAILED', e.message);
        process.exit(1);
      }
    }
  })

  .command({
    command: 'content:publish <file>',
    describe: '发布内容到本地仓库',
    builder: (yargs) => yargs
      .positional('file', { describe: '文件路径', type: 'string' })
      .option('owner', { type: 'string', describe: '发布者 zid' })
      .option('type', { type: 'string', describe: '内容类型' })
      .option('title', { type: 'string', describe: '标题' }),
    handler: async (argv) => {
      try {
        let owner = argv.owner;
        if (!owner) {
          const imgr = require('../identity/manager');
          const self = await imgr.info();
          owner = self.id;
        }
        const result = await bus.execute({
          action: 'content.publish', file: argv.file, owner, type: argv.type,
          metadata: argv.title ? { title: argv.title } : {}
        });
        outResult(result);
      } catch (e) {
        outError('CONTENT_PUBLISH_FAILED', e.message);
        process.exit(1);
      }
    }
  })

  .command({
    command: 'content:show <cid>',
    describe: '查看内容详情',
    builder: (yargs) => yargs.positional('cid', { describe: '内容ID', type: 'string' }),
    handler: async (argv) => {
      try {
        const result = await bus.execute({ action: 'content.show', id: argv.cid });
        outResult(result);
      } catch (e) {
        outError('CONTENT_SHOW_FAILED', e.message);
        process.exit(1);
      }
    }
  })

  .command({
    command: 'content:list',
    describe: '列出已发布内容',
    builder: (yargs) => yargs.option('owner', { type: 'string', describe: '按所有者筛选' }),
    handler: async (argv) => {
      try {
        const result = await bus.execute({ action: 'content.list', owner: argv.owner });
        outResult(result);
      } catch (e) {
        outError('CONTENT_LIST_FAILED', e.message);
        process.exit(1);
      }
    }
  })

  .command({
    command: 'content:share <cid>',
    describe: '分享/转发内容',
    builder: (yargs) => yargs
      .positional('cid', { describe: '内容ID', type: 'string' })
      .option('to', { type: 'string', describe: '分享对象 zid' }),
    handler: async (argv) => {
      try {
        let self;
        try { self = await require('../identity/manager').info(); } catch { self = { id: 'zid:unknown' }; }
        const result = await bus.execute({
          action: 'content.share', contentId: argv.cid, from: self.id, to: argv.to || null
        });
        outResult(result);
      } catch (e) {
        outError('CONTENT_SHARE_FAILED', e.message);
        process.exit(1);
      }
    }
  })

  .command({
    command: 'content:chain <cid>',
    describe: '查看内容传播链',
    builder: (yargs) => yargs.positional('cid', { describe: '内容ID', type: 'string' }),
    handler: async (argv) => {
      try {
        const result = await bus.execute({ action: 'content.chain', contentId: argv.cid });
        outResult(result);
      } catch (e) {
        outError('CONTENT_CHAIN_FAILED', e.message);
        process.exit(1);
      }
    }
  })

  .demandCommand(1, '请指定一个命令')
  .strict()
  .help()
  .argv;
