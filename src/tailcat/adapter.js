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
const ADDR_RE = /listening with new address:\s*(\S+)/;
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
    console.log('[zhixia] "' + String(addr) + '" 不像 tailcat 地址（应以 tc 开头），' + action + ' 无法执行。');
    console.log('        先在对端跑: zhixia tailcat server / recv / serve-files，把打印的 tc 地址传过来。');
    process.exit(1);
  }
}

/**
 * 一次性聊天：把 text 发给对端监听侧（对端跑着 `zhixia tailcat server` / 裸 tailcat）。
 * @returns {Promise<{ok, code, stdout, stderr, error?}>}
 */
function chatSend(addr, text, timeoutMs = 60000) {
  return new Promise((resolve) => {
    const bin = ensureBin();
    assertAddr(addr, 'chat');
    const child = spawn(bin, [addr], { stdio: ['pipe', 'pipe', 'pipe'] });
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
 * 启动 tailcat 监听器并等 tc 地址就绪。
 * @param {string[]} tailcatArgs  tailcat 子命令参数，如 [] / ['recv', dir] / ['serve', 'files', '--files=' + dir]
 * @param {object} opts { label, timeoutMs, interactive }
 * @returns {Promise<{child, address, stop}>}
 *   - interactive=true 时 stdin 直通（`server` 聊天用：连上后可双向打字）
 *   - 地址解析失败/进程早退 → address=null（stderr 已实时转给终端）
 */
function startListener(tailcatArgs, { label = 'tailcat', timeoutMs = 45000, interactive = false } = {}) {
  return new Promise((resolve) => {
    const bin = ensureBin();
    const child = spawn(bin, tailcatArgs, { stdio: [interactive ? 'inherit' : 'ignore', 'pipe', 'pipe'] });
    let address = null;
    let settled = false;
    const stop = () => { try { child.kill('SIGTERM'); } catch (e) { /* ignore */ } };
    const done = (addr) => { if (!settled) { settled = true; resolve({ child, address: addr, stop }); } };
    const scan = (s) => {
      const m = s.match(ADDR_RE);
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
 * @returns {Promise<{ok, code}>}
 */
function cpTo(addr, localFile, { recursive, timeoutMs = 300000 } = {}) {
  return new Promise((resolve) => {
    const bin = ensureBin();
    assertAddr(addr, 'send');
    const args = ['cp'];
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
 * @returns {Promise<{ok, code, error?}>}
 */
function cpFrom(addr, remote, local = '.') {
  return new Promise((resolve) => {
    const bin = ensureBin();
    assertAddr(addr, 'get');
    const child = spawn(bin, ['cp', addr + ':' + remote, local], { stdio: 'inherit' });
    let settled = false;
    const timer = setTimeout(() => { if (!settled) { settled = true; try { child.kill('SIGTERM'); } catch (e) {} resolve({ ok: false, code: -1, error: 'timeout' }); } }, 300000);
    child.on('error', (e) => { clearTimeout(timer); if (!settled) { settled = true; resolve({ ok: false, code: -1, error: e.message }); } });
    child.on('close', (code) => { clearTimeout(timer); if (!settled) { settled = true; resolve({ ok: code === 0, code }); } });
  });
}

/** 列目录：tailcat ls -l <addr> [path]（SFTP 原生，无需对端装 OpenSSH） */
function ls(addr, remotePath) {
  return new Promise((resolve) => {
    const bin = ensureBin();
    assertAddr(addr, 'ls');
    const args = ['ls', '-l', addr];
    if (remotePath) args.push(remotePath);
    const child = spawn(bin, args, { stdio: 'inherit' });
    let settled = false;
    const timer = setTimeout(() => { if (!settled) { settled = true; try { child.kill('SIGTERM'); } catch (e) {} resolve({ ok: false, code: -1, error: 'timeout' }); } }, 120000);
    child.on('error', (e) => { clearTimeout(timer); if (!settled) { settled = true; resolve({ ok: false, code: -1, error: e.message }); } });
    child.on('close', (code) => { clearTimeout(timer); if (!settled) { settled = true; resolve({ ok: code === 0, code }); } });
  });
}

/** 连通性测试：tailcat ping <addr>（每次 pong 显示走 DERP 还是直连） */
function ping(addr) {
  return new Promise((resolve) => {
    const bin = ensureBin();
    assertAddr(addr, 'ping');
    const child = spawn(bin, ['ping', addr], { stdio: 'inherit' });
    let settled = false;
    const timer = setTimeout(() => { if (!settled) { settled = true; try { child.kill('SIGTERM'); } catch (e) {} resolve({ ok: false, code: -1, error: 'timeout' }); } }, 120000);
    child.on('error', (e) => { clearTimeout(timer); if (!settled) { settled = true; resolve({ ok: false, code: -1, error: e.message }); } });
    child.on('close', (code) => { clearTimeout(timer); if (!settled) { settled = true; resolve({ ok: code === 0, code }); } });
  });
}

exports.findBinary = findBinary;
exports.binaryHelp = binaryHelp;
exports.chatSend = chatSend;
exports.startListener = startListener;
exports.cpTo = cpTo;
exports.cpFrom = cpFrom;
exports.ls = ls;
exports.ping = ping;
