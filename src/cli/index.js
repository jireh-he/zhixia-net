#!/usr/bin/env node
// Layer 4: CLI Entry Point

const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const { ZhixiaCLI } = require('./commands');
const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined
});

const cli = new ZhixiaCLI({ logger });

// 优雅退出
process.on('SIGINT', () => {
  cli.stop();
  process.exit(0);
});
process.on('SIGTERM', () => {
  cli.stop();
  process.exit(0);
});

// stdout 只输出 JSON Lines，stderr 输出日志
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
  .option('yes', {
    type: 'boolean',
    default: false,
    describe: '跳过敏感操作确认'
  })
  .option('topic', {
    type: 'string',
    describe: '指定 Topic'
  })

  // join
  .command({
    command: 'join <topic_name>',
    describe: '加入 P2P Topic',
    builder: (yargs) => {
      return yargs.positional('topic_name', {
        describe: 'Topic 名称',
        type: 'string'
      });
    },
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

  // leave
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

  // peers
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

  // send
  .command({
    command: 'send <pubkey> <message>',
    describe: '向指定 Peer 发送文本消息',
    builder: (yargs) => {
      return yargs
        .positional('pubkey', { describe: '目标 Peer 公钥', type: 'string' })
        .positional('message', { describe: '消息内容', type: 'string' });
    },
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

  // send-file
  .command({
    command: 'send-file <pubkey> <file_path>',
    describe: '向指定 Peer 发送文件',
    builder: (yargs) => {
      return yargs
        .positional('pubkey', { describe: '目标 Peer 公钥', type: 'string' })
        .positional('file_path', { describe: '本地文件路径', type: 'string' });
    },
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

  // disconnect
  .command({
    command: 'disconnect <pubkey>',
    describe: '断开指定 Peer',
    builder: (yargs) => {
      return yargs.positional('pubkey', { describe: 'Peer 公钥', type: 'string' });
    },
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

  // events
  .command({
    command: 'events',
    describe: '监听 P2P 事件流（前台模式）',
    handler: async () => {
      cli.on('peer_connect', (payload) => {
        outEvent('peer_connect', payload);
      });
      cli.on('peer_disconnect', (payload) => {
        outEvent('peer_disconnect', payload);
      });
      cli.on('peer_frame', (payload) => {
        // 这里应该经过 Sanitizer，简化版直接输出
        outEvent('peer_message', payload);
      });
      cli.on('peer_blob', (payload) => {
        outEvent('peer_blob', payload);
      });
      cli.on('peer_error', (payload) => {
        outEvent('peer_error', payload);
      });

      await cli.startEvents();
    }
  })

  // doctor
  .command({
    command: 'doctor',
    describe: '诊断工具',
    handler: async () => {
      console.error('✓ 智侠网诊断工具');
      console.error('  版本: 0.2.0');
      console.error('  Node.js: ' + process.version);
      console.error('  平台: ' + process.platform);
      console.error('  数据目录: ' + require('path').join(process.env.HOME, '.zhixia'));
      outResult({ ok: true, version: '0.2.0', node: process.version, platform: process.platform });
    }
  })

  .demandCommand(1, '请指定一个命令')
  .strict()
  .help()
  .argv;
