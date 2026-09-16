'use strict';
/**
 * tailcat adapter — P2P 聊天 & 文件传输
 *
 * 封装 tailcat CLI（github.com/tailscale/tailcat，官方静态二进制放 bin/tailcat/）。
 * tailcat = Tailscale 数据面（magicsock）：WireGuard 端到端加密，公共 DERP 中继
 * 做 bootstrap 信令 + 自动 NAT 打洞升级直连 UDP。无需账号、无自建 relay，
 * 与 zhixia 三级策略（IPv6 Direct / NAT Hole Punch / Tor）互补，作为第四传输层。
 *
 * 二进制解析顺序：
 *   1. $ZHIXIA_TAILCAT 环境变量（显式路径）
 *   2. <repo>/bin/tailcat/tailcat-<platform-arch>（scripts/install-tailcat.js 自动下载）
 *   3. PATH 里的 tailcat
 *
 * Node 16 兼容（ato CentOS 7）：只用 core modules，无 native 依赖。
 */
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const REPO_ROOT = path.join(__dirname, '..', '..');
// 稳定 key 的输出是 "listening with saved key \"xxx\": tcp..."，
// 一次性的是 "listening with new address: tcp..."——两种都得匹配。
// 最稳做法：抓监听行里以 tc 开头、足够长的 token（地址本体），不依赖前缀措辞。
const ADDR_RE = /\b(tc[A-Za-z0-9_-]{20,})/;
const ADDR_PREFIX_RE = /^tc[A-Za-z0-9_-]+$/;

function archTag() {
  const p = process.platform;
  const a = os.arch();
  if (a === 'x64') return p + '-amd64';
  if (a === 'arm64') return p + '-arm64';
  if (a === 'arm' && p === 'linux') return 'linux-armv7';
  return null;
}

function which(name) {
  try {
    const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [name], { stdio: ['ignore', 'pipe', 'ignore'] });
    if (r.status === 0) {
      const line = r.stdout.toString().split('\n')[0].trim();
      if (line && fs.existsSync(line)) return line;
    }
  } catch (e) { /* ignore */ }
  return null;
}

function findBinary() {
  if (process.env.ZHIXIA_TAILCAT && fs.existsSync(process.env.ZHIXIA_TAILCAT)) {
    return process.env.ZHIXIA_TAILCAT;
  }
  const tag = archTag();
  if (tag) {
    const p = path.join(REPO_ROOT, 'bin', 'tailcat', 'tailcat-' + tag);
    if (fs.existsSync(p)) return p;
  }
  return which('tailcat');
}

function binaryHelp() {
  const tag = archTag() || '<platform-arch>';
  console.log('[zhixia] 未找到 tailcat 二进制。安装方式（三选一）：');
  console.log('  1) node --no-warnings ' + path.join('scripts', 'install-tailcat.js') + '   # 自动下载（含国内镜像 fallback + 断点续传）');
  console.log('  2) 手动下载：');
  console.log('     curl -L https://github.com/tailscale/tailcat/releases/latest/download/tailcat_0.6.0_' + tag + '.tar.gz');
  console.log('     tar xzf *.tar.gz -C bin/tailcat/ && mv bin/tailcat/tailcat bin/tailcat/tailcat-' + tag + ' && chmod +x bin/tailcat/tailcat-' + tag);
  console.log('  3) export ZHIXIA_TAILCAT=/path/to/tailcat');
}

function ensureBin() {
  const bin = findBinary();
  if (!bin) {
    binaryHelp();
    process.exit(1);
  }
  return bin;
}

function assertAddr(addr, action) {
  if (!ADDR_PREFIX_RE.test(String(addr || ''))) {
    console.log('[zhixia] "' + String(addr) + '" 不像 P2P 地址（应以 tc 开头），' + action + ' 无法执行。');
    console.log('        先在对端跑: zhixia link chat / inbox / files，把打印的 tc 地址传过来；或用 zhixia link book 存昵称。');
    process.exit(1);
  }
}

// ---- 稳定身份（genkey）----
// tailcat genkey 生成的持久 key（~/.config/tailcat/keys/<name>.private.json）
// 产出的 tc 地址是**永久稳定的**（地址 = key 的确定性函数），
// 这就是通讯录「昵称 → 地址」能一次存永久有效的根基。

/** 运行 genkey，返回 { ok, keyName, address, stderr, existed } */
function genKey(keyName, { fixedRegion = true, force = false } = {}) {
  return new Promise((resolve) => {
    const bin = ensureBin();
    const args = ['genkey', '--key=' + keyName];
    if (fixedRegion) args.push('--fixed-region');
    if (force) args.push('--force');
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { err += d.toString(); });
    const timer = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch (e) { /* ignore */ }
      resolve({ ok: false, keyName, address: null, stderr: err, error: 'timeout' });
    }, 60000);
    child.on('error', (e) => { clearTimeout(timer); resolve({ ok: false, keyName, address: null, stderr: err, error: e.message }); });
    child.on('close', (code) => {
      clearTimeout(timer);
      // genkey 已存在时 RC 仍为 0，但输出里没有地址（只有 "already exists" 日志）——必须先判 existed
      const blob = out + err;
      if (/already exists/i.test(blob)) {
        resolve({ ok: false, keyName, address: null, existed: true, stderr: err });
        return;
      }
      if (code === 0) {
        // 新建成功：genkey 的最后一行输出就是稳定 tc 地址
        const lines = out.trim().split('\n').filter(Boolean);
        const address = lines.length ? lines[lines.length - 1].trim() : '';
        resolve({ ok: ADDR_PREFIX_RE.test(address), keyName, address, existed: false, stderr: err });
      } else {
        resolve({ ok: false, keyName, address: null, existed: false, stderr: err });
      }
    });
  });
}

/**
 * 一次性聊天：把 text 发给对端监听侧（对端跑着 `zhixia link chat` / 裸 tailcat）。
 * @param {object} opts { timeoutMs, keyName }
 * @returns {Promise<{ok, code, stdout, stderr, error?}>}
 */
function chatSend(addr, text, opts = {}) {
  const timeoutMs = opts.timeoutMs || 60000;
  return new Promise((resolve) => {
    const bin = ensureBin();
    assertAddr(addr, 'chat');
    const args = [];
    if (opts.keyName) args.push('--key=' + opts.keyName);
    args.push(addr);
    const child = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    let settled = false;
    const finish = (r) => { if (!settled) { settled = true; resolve(r); } };
    const timer = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch (e) { /* ignore */ }
      finish({ ok: false, code: -1, stdout: out, stderr: err + (err ? '\n' : '') + 'timeout after ' + Math.round(timeoutMs / 1000) + 's', error: 'timeout' });
    }, timeoutMs);
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('error', (e) => { clearTimeout(timer); finish({ ok: false, code: -1, stdout: out, stderr: err, error: e.message }); });
    child.on('close', (code) => {
      clearTimeout(timer);
      finish({ ok: code === 0, code, stdout: out, stderr: err });
    });
    child.stdin.write(text.endsWith('\n') ? text : text + '\n');
    child.stdin.end();
  });
}

/**
 * 启动监听器并等 tc 地址就绪。
 * @param {string[]} subArgs  子命令参数（不含全局 --key），如 [] / ['recv', dir] / ['serve', fsArg, 'files']
 * @param {object} opts { label, timeoutMs, interactive, keyName }
 * @returns {Promise<{child, address, stop}>}
 *   - keyName: 注入 `--key=<name>`（全局 flag，插在子命令前）用稳定身份 → 地址永久稳定
 *   - interactive=true 时 stdin 直通（chat 用：连上后可双向打字）
 *   - 地址解析失败/进程早退 → address=null（stderr 已实时转给终端）
 */
function startListener(subArgs, opts = {}) {
  const { label = 'link', timeoutMs = 45000, interactive = false, keyName } = opts;
  return new Promise((resolve) => {
    const bin = ensureBin();
    const args = keyName ? ['--key=' + keyName] : [];
    args.push(...subArgs);
    const child = spawn(bin, args, { stdio: [interactive ? 'inherit' : 'ignore', 'pipe', 'pipe'] });
    let address = null;
    let settled = false;
    let tail = ''; // 滑动窗口：地址 token 可能被 data chunk 截断，累积尾部再匹配
    const stop = () => { try { child.kill('SIGTERM'); } catch (e) { /* ignore */ } };
    const done = (addr) => { if (!settled) { settled = true; resolve({ child, address: addr, stop }); } };
    const scan = (s) => {
      tail = (tail + s).slice(-600); // 保留最近 600 字符，防止无界增长
      const m = tail.match(ADDR_RE);
      if (m) address = m[1];
    };
    child.stdout.on('data', (d) => { const s = d.toString(); process.stdout.write(s); scan(s); });
    child.stderr.on('data', (d) => { const s = d.toString(); process.stderr.write(s); scan(s); });
    child.on('exit', (code) => { done(address); });
    const t0 = Date.now();
    const timer = setInterval(() => {
      if (address) { clearInterval(timer); done(address); }
      else if (Date.now() - t0 > timeoutMs) { clearInterval(timer); if (child.exitCode === null) stop(); done(null); }
    }, 250);
  });
}

/**
 * 传文件：tailcat cp [ -r ] <local> <addr>:  （内部走系统 scp 的进度显示）
 * @param {object} opts { recursive, timeoutMs, keyName }
 * @returns {Promise<{ok, code}>}
 */
function cpTo(addr, localFile, opts = {}) {
  const { recursive, timeoutMs = 300000, keyName } = opts;
  return new Promise((resolve) => {
    const bin = ensureBin();
    assertAddr(addr, 'send');
    const args = withKey(keyName, ['cp']);
    if (recursive) args.push('-r');
    args.push(localFile, addr + ':');
    const child = spawn(bin, args, { stdio: 'inherit' });
    let settled = false;
    const timer = setTimeout(() => { if (!settled) { settled = true; try { child.kill('SIGTERM'); } catch (e) {} resolve({ ok: false, code: -1, error: 'timeout' }); } }, timeoutMs);
    child.on('error', (e) => { clearTimeout(timer); if (!settled) { settled = true; resolve({ ok: false, code: -1, error: e.message }); } });
    child.on('close', (code) => { clearTimeout(timer); if (!settled) { settled = true; resolve({ ok: code === 0, code }); } });
  });
}

/**
 * 拉文件：tailcat cp <addr>:<remote> [local]
 * @param {object} opts { local, keyName }
 * @returns {Promise<{ok, code, error?}>}
 */
function cpFrom(addr, remote, opts = {}) {
  const local = opts.local || '.';
  const keyName = opts.keyName;
  return new Promise((resolve) => {
    const bin = ensureBin();
    assertAddr(addr, 'get');
    const args = withKey(keyName, ['cp', addr + ':' + remote, local]);
    const child = spawn(bin, args, { stdio: 'inherit' });
    let settled = false;
    const timer = setTimeout(() => { if (!settled) { settled = true; try { child.kill('SIGTERM'); } catch (e) {} resolve({ ok: false, code: -1, error: 'timeout' }); } }, 300000);
    child.on('error', (e) => { clearTimeout(timer); if (!settled) { settled = true; resolve({ ok: false, code: -1, error: e.message }); } });
    child.on('close', (code) => { clearTimeout(timer); if (!settled) { settled = true; resolve({ ok: code === 0, code }); } });
  });
}

/** 列目录：tailcat ls -l <addr> [path]（SFTP 原生，无需对端装 OpenSSH） */
function ls(addr, remotePath, keyName) {
  return new Promise((resolve) => {
    const bin = ensureBin();
    assertAddr(addr, 'ls');
    const args = withKey(keyName, ['ls', '-l', addr]);
    if (remotePath) args.push(remotePath);
    const child = spawn(bin, args, { stdio: 'inherit' });
    let settled = false;
    const timer = setTimeout(() => { if (!settled) { settled = true; try { child.kill('SIGTERM'); } catch (e) {} resolve({ ok: false, code: -1, error: 'timeout' }); } }, 120000);
    child.on('error', (e) => { clearTimeout(timer); if (!settled) { settled = true; resolve({ ok: false, code: -1, error: e.message }); } });
    child.on('close', (code) => { clearTimeout(timer); if (!settled) { settled = true; resolve({ ok: code === 0, code }); } });
  });
}

/** 连通性测试：tailcat ping <addr>（每次 pong 显示走 DERP 还是直连） */
function ping(addr, keyName) {
  return new Promise((resolve) => {
    const bin = ensureBin();
    assertAddr(addr, 'ping');
    const args = withKey(keyName, ['ping', addr]);
    const child = spawn(bin, args, { stdio: 'inherit' });
    let settled = false;
    const timer = setTimeout(() => { if (!settled) { settled = true; try { child.kill('SIGTERM'); } catch (e) {} resolve({ ok: false, code: -1, error: 'timeout' }); } }, 120000);
    child.on('error', (e) => { clearTimeout(timer); if (!settled) { settled = true; resolve({ ok: false, code: -1, error: e.message }); } });
    child.on('close', (code) => { clearTimeout(timer); if (!settled) { settled = true; resolve({ ok: code === 0, code }); } });
  });
}

/** 全局 flag 前缀：--key 是 tailcat 顶层 flag，必须插在子命令之前 */
function withKey(keyName, subArgs) {
  return keyName ? ['--key=' + keyName].concat(subArgs) : subArgs.slice();
}

exports.findBinary = findBinary;
exports.binaryHelp = binaryHelp;
exports.chatSend = chatSend;
exports.startListener = startListener;
exports.cpTo = cpTo;
exports.cpFrom = cpFrom;
exports.ls = ls;
exports.ping = ping;
exports.genKey = genKey;
