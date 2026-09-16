'use strict';
/**
 * zhixia link <sub> — P2P 聊天 & 文件传输（第四传输层）
 *
 * 引擎：github.com/tailscale/tailcat 官方静态二进制（bin/tailcat/，install-tailcat.js 下载）
 * 特性：WireGuard 端到端加密 + 公共 DERP 中继 NAT 打洞，纯 P2P 无自建 relay。
 *
 * 核心设计 —— 稳定身份 + 通讯录：
 *   引擎 genkey 生成持久 key（~/.config/tailcat/keys/），对应 tc 地址**永久稳定**。
 *   通讯录 data/link-book.json 存「昵称 → 朋友稳定地址」，一次存永久有效：
 *   以后 send/get/ls/ping 直接 +昵称，自动匹配地址，不用记/传长地址串。
 *
 * 子命令：
 *   link key                  生成/显示本端稳定身份（首次自动 genkey）
 *   link book add <昵称> <tc地址>   把朋友存进通讯录
 *   link book remove <昵称>       删除
 *   link book [list]            列出通讯录
 *   link chat [--name X]      聊天监听（打印本端稳定地址，连上后双向打字）
 *   link inbox [dir]          文件收件箱（write-only drop box）
 *   link files [dir] [--rw]   文件服务（SFTP，默认只读）
 *   link send <昵称|地址> <text>
 *   link send-file <文件...> <昵称|地址> [-r]
 *   link get <昵称|地址> <远端文件> [本地路径]
 *   link ls <昵称|地址> [路径]
 *   link ping <昵称|地址>
 *   link last                 显示本端稳定地址
 *
 * 本模块自带 argv 解析（main），不依赖 yargs：yargs 17 strict 模式与
 * variadic positional 不兼容（变参值被当 unknown argument 拒绝）。
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const {
  startListener, chatSend, cpTo, cpFrom, ls, ping, genKey
} = require('../../tailcat/adapter');

const DEFAULT_KEY = 'zhixia-default';
const IDENTITY_FILE = path.join(process.cwd(), 'data', 'link-identity.json');
const BOOK_FILE = path.join(process.cwd(), 'data', 'link-book.json');
const KEY_DIR = path.join(os.homedir(), '.config', 'tailcat', 'keys');

const USAGE = [
  'zhixia link <sub> [args]   （P2P 聊天 & 文件传输，第四传输层）',
  '',
  '身份 / 通讯录:',
  '  key                         生成/显示本端稳定 P2P 身份（地址永久不变）',
  '  book add <昵称> <tc地址>    把朋友存进通讯录（对方先跑 link key 把他的稳定地址给你）',
  '  book remove <昵称>          从通讯录删除',
  '  book [list]                 查看通讯录',
  '',
  '监听（本端起服务，地址自动用稳定身份，不会变）:',
  '  chat [--name X]             聊天监听（连上后双向打字；一次性会话）',
  '  inbox [dir]                 文件收件箱（write-only，默认 ./zhixia-inbox）',
  '  files [dir] [--rw]          文件服务（SFTP，默认只读）',
  '',
  '访问朋友（target 可以是昵称或 tc 地址，昵称自动匹配通讯录）:',
  '  send <昵称|地址> <文本>                聊天消息',
  '  send-file <文件...> <昵称|地址> [-r]   发文件到对方 inbox',
  '  get <昵称|地址> <远端文件> [本地路径]   从对方 files 服务拉文件',
  '  ls <昵称|地址> [路径]                  列对方 files 目录',
  '  ping <昵称|地址>                        连通测试（DERP 中继 vs 直连）',
  '',
  '  last                          显示本端稳定地址',
].join('\n');

// ---------- 身份 ----------
function keyFileExists(keyName) {
  return fs.existsSync(path.join(KEY_DIR, keyName + '.private.json'));
}

function loadIdentity() {
  if (!fs.existsSync(IDENTITY_FILE)) return null;
  try { return JSON.parse(fs.readFileSync(IDENTITY_FILE, 'utf8')); } catch (e) { return null; }
}

function saveIdentity(info) {
  const dir = path.dirname(IDENTITY_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(IDENTITY_FILE, JSON.stringify(info, null, 2));
}

/**
 * 确保稳定身份存在，返回 { keyName, address }。
 * 优先级：本地记录 → key 文件在（地址记录丢了则起监听器恢复，同 key 同 region 地址确定性一致）→ genkey 新建。
 */
async function ensureIdentity() {
  let id = loadIdentity();
  if (id && id.address) return id;

  if (keyFileExists(DEFAULT_KEY)) {
    // key 在但记录丢了：用监听器恢复确定性地址（同 key + fixed-region 每次打印同一个地址）
    const { address, stop } = await startListener([], {
      label: 'recover', keyName: DEFAULT_KEY, timeoutMs: 60000
    });
    stop();
    if (address) {
      id = { keyName: DEFAULT_KEY, address, ts: Date.now() };
      saveIdentity(id);
      return id;
    }
  }

  const r = await genKey(DEFAULT_KEY);
  if (!r.ok && !r.existed) {
    console.log('[zhixia] ✗ 生成稳定身份失败:', r.stderr || r.error);
    process.exit(1);
  }
  // r.existed=true 但上面恢复又失败（网络不通）——只能提示
  id = { keyName: r.keyName || DEFAULT_KEY, address: r.address, ts: Date.now() };
  if (!id.address) {
    console.log('[zhixia] ✗ 未能确定稳定地址（DERP 网络不通？key 已存在，恢复记录失败）');
    process.exit(1);
  }
  saveIdentity(id);
  return id;
}

exports.keyCmd = async () => {
  const id = await ensureIdentity();
  console.log('[zhixia] 本端稳定 P2P 身份');
  console.log('  身份名: ' + id.keyName);
  console.log('  稳定地址: ' + id.address);
  console.log('  把此地址发给朋友，他跑: zhixia link book add <你的昵称> ' + id.address);
  console.log('  （地址永久不变，存一次通讯录就够了；key 存于 ' + KEY_DIR + '/）');
};

// ---------- 通讯录 ----------
function loadBook() {
  if (!fs.existsSync(BOOK_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(BOOK_FILE, 'utf8')); } catch (e) { return {}; }
}

function saveBook(book) {
  const dir = path.dirname(BOOK_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(BOOK_FILE, JSON.stringify(book, null, 2));
}

/** 昵称/地址 → 地址。昵称走通讯录（大小写不敏感 + 子串匹配兜底） */
function resolveTarget(target) {
  const t = String(target || '').trim();
  if (/^tc[A-Za-z0-9_-]+$/.test(t)) return { addr: t, via: '地址' };
  const book = loadBook();
  const names = Object.keys(book);
  // 精确（忽略大小写）
  let hit = names.find(n => n === t);
  if (hit) return { addr: book[hit].address, via: '通讯录: ' + hit };
  // 唯一子串兜底
  const subs = names.filter(n => n.toLowerCase().includes(t.toLowerCase()));
  if (subs.length === 1) return { addr: book[subs[0]].address, via: '通讯录: ' + subs[0] };
  console.log('[zhixia] ✗ "' + t + '" 不是 tc 地址，通讯录里也没有这个昵称。');
  if (names.length) {
    console.log('        可用昵称: ' + names.join('、'));
  } else {
    console.log('        通讯录为空。先跑: zhixia link book add <昵称> <对方tc地址>');
  }
  process.exit(1);
}

exports.bookCmd = async (args) => {
  const sub = args[0];
  const book = loadBook();
  if (!sub || sub === 'list') {
    const names = Object.keys(book);
    console.log('[zhixia] 通讯录 (' + names.length + ' 人):');
    if (!names.length) console.log('  (空) 添加: zhixia link book add <昵称> <tc地址>');
    names.forEach(n => {
      console.log('  ' + n + ' → ' + book[n].address + (book[n].note ? '  (' + book[n].note + ')' : ''));
    });
    return;
  }
  if (sub === 'add') {
    const nick = args[1];
    const addr = args[2];
    if (!nick || !addr) { console.log('[zhixia] 用法: zhixia link book add <昵称> <tc地址>'); process.exit(1); }
    if (!/^tc[A-Za-z0-9_-]+$/.test(addr)) { console.log('[zhixia] ✗ "' + addr + '" 不是合法 tc 地址（应以 tc 开头，完整粘贴）'); process.exit(1); }
    book[nick] = { address: addr, ts: Date.now() };
    saveBook(book);
    console.log('[zhixia] ✓ 已添加 ' + nick + ' → ' + addr);
    console.log('        现在可以: zhixia link send ' + nick + " \"hi\"");
    return;
  }
  if (sub === 'remove') {
    const nick = args[1];
    if (!book[nick]) { console.log('[zhixia] 通讯录里没有 "' + (nick || '') + '"'); process.exit(1); }
    delete book[nick];
    saveBook(book);
    console.log('[zhixia] ✓ 已删除 ' + nick);
    return;
  }
  console.log('[zhixia] 未知 book 子命令: ' + sub);
  console.log('用法: zhixia link book [list] | add <昵称> <tc地址> | remove <昵称>');
  process.exit(1);
};

// ---------- 监听（全部自动带稳定身份 --key） ----------
async function withKey(opts) {
  const id = await ensureIdentity();
  opts.keyName = id.keyName;
  return { id, opts };
}

exports.chat = async (args = {}) => {
  const { id, opts } = await withKey({});
  opts.name = args.name || 'chat';
  opts.interactive = true;
  const { address } = await startListener([], opts);
  if (!address) {
    console.log('[zhixia] 未能解析到地址（DERP 超时？），进程仍在运行，看上方日志。');
    return;
  }
  console.log('');
  console.log('┌──────────────────────────────────────┐');
  console.log('│ zhixia link chat — P2P 聊天已就绪         │');
  console.log('└──────────────────────────────────────┘');
  console.log('本端稳定地址（发给朋友存进通讯录）:');
  console.log('  ' + id.address);
  console.log('朋友存好后可直接: zhixia link send <你的昵称> "消息"');
  console.log('（对端连上后可在此终端双向打字；Ctrl+C 退出）');
};

exports.inbox = async (args = {}) => {
  const { id, opts } = await withKey({});
  const dir = args.dir || path.join(process.cwd(), 'zhixia-inbox');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const { address } = await startListener(['recv', dir], { ...opts, label: 'inbox', interactive: false });
  if (!address) { console.log('[zhixia] inbox 启动失败（见上方日志）'); process.exitCode = 1; return; }
  console.log('');
  console.log('zhixia 收件箱 → ' + dir);
  console.log('本端稳定地址: ' + id.address);
  console.log('朋友发送: zhixia link send-file <文件> <你的昵称/地址>');
};

exports.files = async (args = {}) => {
  const { id, opts } = await withKey({});
  const dir = args.dir || process.cwd();
  const fsArg = '--files=' + dir + (args.rw ? ':rw' : '');
  const { address } = await startListener(['serve', fsArg, 'files'], { ...opts, label: 'files', interactive: false });
  if (!address) { console.log('[zhixia] files 服务启动失败（见上方日志）'); process.exitCode = 1; return; }
  console.log('');
  console.log('zhixia 文件服务 ' + (args.rw ? '[rw]' : '[ro]') + ' → ' + dir);
  console.log('本端稳定地址: ' + id.address);
  console.log('朋友拉取: zhixia link get <你的昵称/地址> <文件名>');
};

// ---------- 访问朋友（昵称自动匹配） ----------
async function targetOpts(target) {
  const { addr, via } = resolveTarget(target);
  const { id } = await withKey({});
  if (via !== '地址') console.log('[zhixia] ' + target + ' → ' + addr + '（' + via + '）');
  return { keyName: id.keyName, addr };
}

exports.send = async (args) => {
  const t = await targetOpts(args[0]);
  const text = args.slice(1).join(' ');
  if (!text) { console.log('[zhixia] 用法: zhixia link send <昵称|地址> <文本>'); process.exit(1); }
  const { ok, code, stderr } = await chatSend(t.addr, text, { keyName: t.keyName });
  if (ok) {
    console.log('[zhixia] ✓ 已发送: ' + text);
    console.log('        （对方 link chat 终端会显示；若长时间没显示，对方可能没开 link chat）');
  } else {
    if (stderr.trim()) process.stderr.write(stderr);
    console.log('[zhixia] ✗ 发送失败（code=' + code + '）');
    process.exitCode = 1;
  }
};

exports.sendFile = async (args) => {
  // 位置参数：最后一个 = target；-r 可选；其余 = 文件
  let recursive = false;
  const pos = [];
  for (const a of args) {
    if (a === '-r' || a === '--recursive') recursive = true;
    else pos.push(a);
  }
  if (pos.length < 2) { console.log('[zhixia] 用法: zhixia link send-file <文件...> <昵称|地址> [-r]'); process.exit(1); }
  const target = pos[pos.length - 1];
  const files = pos.slice(0, pos.length - 1);
  const t = await targetOpts(target);
  for (const f of files) {
    if (!fs.existsSync(f)) { console.log('[zhixia] ✗ 本地文件不存在: ' + f); process.exitCode = 1; continue; }
    console.log('[zhixia] 发送 ' + f + ' → ' + target + ' 的收件箱...');
    const { ok, code } = await cpTo(t.addr, f, { recursive, keyName: t.keyName });
    if (!ok) {
      console.log('[zhixia] ✗ 传输失败（code=' + code + '）— 对方要跑: zhixia link inbox');
      process.exitCode = 1;
    } else {
      console.log('[zhixia] ✓ ' + f + ' 已送达（drop box 可能加时间戳后缀，让对方 link ls 确认）');
    }
  }
};

exports.get = async (args) => {
  if (args.length < 2) { console.log('[zhixia] 用法: zhixia link get <昵称|地址> <远端文件> [本地路径]'); process.exit(1); }
  const t = await targetOpts(args[0]);
  const { ok, code, error } = await cpFrom(t.addr, args[1], { local: args[2] || '.', keyName: t.keyName });
  if (!ok) {
    console.log('[zhixia] ✗ 拉取失败' + (error ? ' (' + error + ')' : '（code=' + code + '）') + ' — 对方要跑: zhixia link files');
    process.exitCode = 1;
  } else {
    console.log('[zhixia] ✓ ' + args[1] + ' → ' + (args[2] || '.') + ' 完成');
  }
};

exports.lsDir = async (args) => {
  if (!args[0]) { console.log('[zhixia] 用法: zhixia link ls <昵称|地址> [路径]'); process.exit(1); }
  const t = await targetOpts(args[0]);
  const { ok, code, error } = await ls(t.addr, args[1], t.keyName);
  if (!ok) {
    console.log('[zhixia] ✗ ls 失败' + (error ? ' (' + error + ')' : '（code=' + code + '）') + ' — 对方要跑: zhixia link files');
    process.exitCode = 1;
  }
};

exports.ping = async (args) => {
  if (!args[0]) { console.log('[zhixia] 用法: zhixia link ping <昵称|地址>'); process.exit(1); }
  const t = await targetOpts(args[0]);
  const { ok, code, error } = await ping(t.addr, t.keyName);
  console.log('[zhixia] ping ' + t.addr + ' 结果: ' + (ok ? '✓ 可达' : '✗ 不可达（code=' + code + (error ? ', ' + error : '') + '）'));
  if (!ok) process.exitCode = 1;
};

exports.last = async () => {
  const id = loadIdentity();
  if (!id || !id.address) {
    console.log('[zhixia] 尚无稳定身份。先跑: zhixia link key');
    return;
  }
  console.log('本端稳定 P2P 地址 (' + id.keyName + '):');
  console.log('  ' + id.address);
  console.log('（永久不变；把此地址发给朋友存进他通讯录）');
};

// ---------- argv 解析入口 ----------
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
    case 'key':
      p = exports.keyCmd();
      break;
    case 'book':
      p = exports.bookCmd(rest);
      break;
    case 'chat':
      p = exports.chat({ name: pickFlag(rest, ['--name', '-n']) });
      break;
    case 'inbox':
      p = exports.inbox({ dir: rest.find(x => !x.startsWith('-')) });
      break;
    case 'files':
      p = exports.files({ dir: rest.find(x => !x.startsWith('-')), rw: rest.includes('--rw') || rest.includes('-rw') });
      break;
    case 'send':
      p = exports.send(rest);
      break;
    case 'send-file':
      p = exports.sendFile(rest);
      break;
    case 'get':
      p = exports.get(rest);
      break;
    case 'ls':
      p = exports.lsDir(rest);
      break;
    case 'ping':
      p = exports.ping(rest);
      break;
    case 'last':
      p = exports.last();
      break;
    default:
      fail('未知子命令: ' + sub);
      console.log(USAGE);
  }
  if (p && p.then) p.catch((e) => { console.error('[zhixia] 错误:', e && e.message ? e.message : e); process.exit(1); });
};

function pickFlag(args, flags) {
  const i = args.findIndex(a => flags.includes(a));
  if (i === -1) return undefined;
  return args[i + 1];
}
