'use strict';
/**
 * zhixia tailcat <sub> — P2P 聊天 & 文件传输（封装 tailcat，第四传输层）
 *
 *   tailcat server [--name X]      起聊天监听器（打印 tc 地址，连上后双向打字）
 *   tailcat recv [dir]             文件收件箱（write-only drop box，默认 ./zhixia-inbox）
 *   tailcat serve-files [dir] [--rw]  文件服务（files SFTP，默认只读）
 *   tailcat send <addr> <text>     一次性发给对端 server
 *   tailcat send-file <file...> <addr> [-r]   传文件给对端 recv
 *   tailcat get <addr> <remote> [local]        从对端 files/ssh 拉文件
 *   tailcat ls <addr> [path]      列目录（SFTP）
 *   tailcat ping <addr>           连通测试（DERP vs 直连）
 *   tailcat last                  显示本端最近记住的 tc 地址
 *
 * 本模块自带 argv 解析（main），不依赖 yargs：yargs 17 strict 模式与
 * variadic positional 不兼容（变参值被当 unknown argument 拒绝）。
 */
const path = require('path');
const fs = require('fs');
const {
  startListener, chatSend, cpTo, cpFrom, ls, ping
} = require('../../tailcat/adapter');

const USAGE = [
  'zhixia tailcat <sub> [args]',
  '  server [--name X]             起 P2P 聊天监听器（打印 tc 地址，连上后双向打字）',
  '  recv [dir]                    文件收件箱（write-only drop box，默认 ./zhixia-inbox）',
  '  serve-files [dir] [--rw]      文件服务（files SFTP，默认只读）',
  '  send <addr> <text>            一次性聊天消息发给对端 server',
  '  send-file <file...> <addr> [-r]  发文件给对端 recv 收件箱（-r 目录递归）',
  '  get <addr> <remote> [local]   从对端 files 服务拉文件',
  '  ls <addr> [path]              列对端目录（SFTP）',
  '  ping <addr>                   连通测试（DERP vs 直连）',
  '  last                          显示本端最近记住的 tc 地址',
].join('\n');

// 记住最近一次本端 tc 地址（跨 CLI 调用分享：zhixia 每次是新进程，
// 所以 tailcat 端点地址必须靠 --last 持久化到 data/tailcat.last-addr.json）
const LAST_ADDR = path.join(process.cwd(), 'data', 'tailcat.last-addr.json');

function remember(addr, kind) {
  try {
    const dir = path.dirname(LAST_ADDR);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const f = { address: addr, kind, ts: Date.now() };
    fs.writeFileSync(LAST_ADDR, JSON.stringify(f, null, 2));
    console.log('[zhixia] 已记住本端地址 → ' + LAST_ADDR + '（对端用它发送）');
  } catch (e) { /* ignore */ }
}

function run(args) {
  return args.then ? args : Promise.resolve(args);
}

// ---- 子命令 ----
exports.server = async (opts = {}) => {
  const label = opts.name || 'chat';
  const { address } = await startListener([], { label: 'chat', interactive: true, timeoutMs: 60000 });
  if (!address) {
    console.log('[zhixia] 未能解析到 tc 地址（DERP bootstrap 超时？），进程仍在运行，请查看上方日志。');
    return;
  }
  remember(address, 'server');
  console.log('');
  console.log('┌──────────────────────────────────────────────┐');
  console.log('│ zhixia tailcat ' + label + ' — P2P 聊天已就绪             │');
  console.log('│ 本端 tc 地址（发给对端做 tailcat send 用）：  │');
  console.log('│ ' + address + '          │');
  console.log('│ 对端: zhixia tailcat send <此地址> "消息"      │');
  console.log('└──────────────────────────────────────────────┘');
  console.log('（对端连上后可在此终端双向打字；Ctrl+C 退出）');
};

exports.recv = async (opts = {}) => {
  const dir = opts.dir || path.join(process.cwd(), 'zhixia-inbox');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const { address } = await startListener(['recv', dir], { label: 'recv', timeoutMs: 60000 });
  if (!address) { console.log('[zhixia] recv 启动失败（见上方 stderr）'); process.exitCode = 1; return; }
  remember(address, 'recv');
  console.log('');
  console.log('zhixia 收件箱 → ' + dir);
  console.log('对端发送: zhixia tailcat send-file <文件> ' + address);
};

exports.serveFiles = async (opts = {}) => {
  const dir = opts.dir || process.cwd();
  const fsArg = '--files=' + dir + (opts.rw ? ':rw' : '');
  const { address } = await startListener(['serve', fsArg, 'files'], { label: 'files', timeoutMs: 60000 });
  if (!address) { console.log('[zhixia] serve-files 启动失败（见上方 stderr）'); process.exitCode = 1; return; }
  remember(address, 'files');
  console.log('');
  console.log('zhixia 文件服务 ' + (opts.rw ? '[rw]' : '[ro]') + ' → ' + dir);
  console.log('对端: zhixia tailcat get ' + address + ' <文件名>');
  console.log('      zhixia tailcat ls ' + address);
};

exports.send = async (opts = {}) => {
  const { ok, code, stderr } = await chatSend(opts.addr, opts.text);
  if (ok) {
    console.log('[zhixia] ✓ 已发送: ' + opts.text);
    console.log('        （对端 server 终端会显示；若 60s 内没显示，对端可能没跑 tailcat server 或 DERP 网络不通）');
  } else {
    if (stderr.trim()) process.stderr.write(stderr);
    console.log('[zhixia] ✗ 发送失败（code=' + code + '）');
    process.exitCode = 1;
  }
};

exports.sendFile = async (opts = {}) => {
  const { files, addr, recursive } = opts;
  for (const f of files) {
    if (!fs.existsSync(f)) {
      console.log('[zhixia] ✗ 本地文件不存在: ' + f);
      process.exitCode = 1;
      continue;
    }
    console.log('[zhixia] 发送 ' + f + ' → 收件箱...');
    const { ok, code } = await cpTo(addr, f, { recursive });
    if (!ok) {
      console.log('[zhixia] ✗ 传输失败（code=' + code + '）— 对端收件箱要跑: zhixia tailcat recv');
      process.exitCode = 1;
    } else {
      console.log('[zhixia] ✓ ' + f + ' 已送达（drop box 可能加时间戳后缀，ls 对端收件箱确认）');
    }
  }
};

exports.get = async (opts = {}) => {
  const { ok, code, error } = await cpFrom(opts.addr, opts.remote, opts.local || '.');
  if (!ok) {
    console.log('[zhixia] ✗ 拉取失败' + (error ? ' (' + error + ')' : '（code=' + code + '）'));
    process.exitCode = 1;
  } else {
    console.log('[zhixia] ✓ ' + opts.remote + ' → ' + (opts.local || '.') + ' 完成');
  }
};

exports.lsDir = async (opts = {}) => {
  const { ok, code, error } = await ls(opts.addr, opts.path);
  if (!ok) {
    console.log('[zhixia] ✗ ls 失败' + (error ? ' (' + error + ')' : '（code=' + code + '）'));
    process.exitCode = 1;
  }
};

exports.ping = async (opts = {}) => {
  const { ok, code, error } = await ping(opts.addr);
  console.log('[zhixia] ping ' + opts.addr + ' 结果: ' + (ok ? '✓ 可达' : '✗ 不可达（code=' + code + (error ? ', ' + error : '') + '）'));
  if (!ok) process.exitCode = 1;
};

exports.lastAddr = () => {
  if (!fs.existsSync(LAST_ADDR)) {
    console.log('[zhixia] 尚无记录。先跑: zhixia tailcat server / recv / serve-files');
    return;
  }
  const f = JSON.parse(fs.readFileSync(LAST_ADDR, 'utf8'));
  console.log('最近本端 tc 地址 (' + f.kind + ', ' + new Date(f.ts).toLocaleString() + '):');
  console.log('  ' + f.address);
};

// ---- 独立 argv 解析器（bin/zhixia.js 顶部拦截调用）----
exports.main = (argv) => {
  const sub = argv[0];
  const rest = argv.slice(1);
  if (!sub || sub === '-h' || sub === '--help' || sub === 'help') {
    console.log(USAGE);
    return;
  }
  const fail = (msg) => { console.log('[zhixia] ' + msg); process.exit(1); };
  let p;
  switch (sub) {
    case 'server':
      p = exports.server({ name: pickFlag(rest, ['--name', '-n']) });
      break;
    case 'recv':
      p = exports.recv({ dir: rest.find(x => !x.startsWith('-')) });
      break;
    case 'serve-files':
      p = exports.serveFiles({ dir: rest.find(x => !x.startsWith('-')), rw: rest.includes('--rw') || rest.includes('-rw') });
      break;
    case 'send': {
      if (rest.length < 2) fail('用法: zhixia tailcat send <tc地址> <文本>');
      p = exports.send({ addr: rest[0], text: rest.slice(1).join(' ') });
      break;
    }
    case 'send-file': {
      // 位置参数里最后一个 = tc 地址；-r 可选；其余都是文件
      if (rest.length < 2) fail('用法: zhixia tailcat send-file <文件...> <tc地址> [-r]');
      let recursive = false;
      const pos = rest.filter(x => x !== '-r' && x !== '--recursive');
      if (rest.includes('-r') || rest.includes('--recursive')) recursive = true;
      const addr = pos[pos.length - 1];
      const files = pos.slice(0, pos.length - 1);
      p = exports.sendFile({ files, addr, recursive });
      break;
    }
    case 'get':
      if (rest.length < 2) fail('用法: zhixia tailcat get <tc地址> <远端文件> [本地路径]');
      p = exports.get({ addr: rest[0], remote: rest[1], local: rest[2] });
      break;
    case 'ls':
      p = exports.lsDir({ addr: rest[0], path: rest[1] });
      break;
    case 'ping':
      p = exports.ping({ addr: rest[0] });
      break;
    case 'last':
      exports.lastAddr();
      p = Promise.resolve();
      break;
    default:
      console.log('未知子命令: ' + sub);
      console.log(USAGE);
      process.exit(1);
  }
  run(p);
};

function pickFlag(args, flags) {
  const i = args.findIndex(a => flags.includes(a));
  if (i === -1) return undefined;
  return args[i + 1];
}
