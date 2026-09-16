'use strict';
/**
 * install-tailcat.js — 自动下载 tailcat 静态二进制到 bin/tailcat/
 * 用法: node --no-warnings scripts/install-tailcat.js
 * 特性: 官方 GitHub release + 4 个国内镜像 fallback + 断点续传 + sha256 校验（校验和来自 release checksums.txt，网络不可用时跳过）
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const VERSION = '0.6.0';
const REPO_ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(REPO_ROOT, 'bin', 'tailcat');
const CHECKSUMS_URL = 'https://github.com/tailscale/tailcat/releases/download/v' + VERSION + '/checksums.txt';

function archAsset() {
  const p = process.platform;
  const a = os.arch();
  let osTag = p === 'darwin' ? 'darwin' : p === 'win32' ? 'windows' : p === 'linux' ? 'linux' : null;
  if (!osTag) { console.error('[install-tailcat] 不支持的平台: ' + p); process.exit(1); }
  let archTag;
  if (a === 'x64') archTag = 'amd64';
  else if (a === 'arm64') archTag = 'arm64';
  else if (a === 'arm') archTag = 'armv7';
  else { console.error('[install-tailcat] 不支持的架构: ' + a); process.exit(1); }
  const ext = p === 'win32' ? 'zip' : 'tar.gz';
  return { osTag, archTag, ext, target: 'tailcat-' + osTag + '-' + archTag };
}

function curl(url, out, resume) {
  const args = ['-sL', '--max-time', '120', '--retry', '1'];
  if (resume) args.push('-C', '-');
  if (out) args.push('-o', out);
  args.push(url);
  return spawnSync('curl', args, { stdio: ['ignore', 'pipe', 'pipe'] });
}

function main() {
  const { osTag, archTag, ext, target } = archAsset();
  const filename = 'tailcat_' + VERSION + '_' + osTag + '_' + archTag + '.' + ext;
  const base = 'https://github.com/tailscale/tailcat/releases/download/v' + VERSION + '/' + filename;
  const mirrors = ['https://github.moeyy.xyz/', 'https://gh-proxy.com/', 'https://mirror.ghproxy.com/', 'https://ghproxy.net/'];
  const outDir = OUT_DIR;
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  // 校验和（可拿则拿）
  let expected = null;
  try {
    const cs = curl(CHECKSUMS_URL, null, false);
    if (cs.status === 0) {
      const line = cs.stdout.toString().split('\n').find(l => l.includes(filename));
      if (line) expected = line.trim().split(/\s+/)[0];
      console.log('[install-tailcat] checksum: ' + (expected ? expected.slice(0, 16) + '...' : '(official checksum unavailable)'));
    }
  } catch (e) { console.log('[install-tailcat] checksum fetch skipped:', e.message); }

  const blob = path.join(outDir, 'download-' + target);
  const final = path.join(outDir, target);
  const urls = [base, ...mirrors.map(m => m + base)];
  let downloaded = false;

  // 断点续传循环：每次 curl 从断点继续，直到产物完整
  for (let i = 0; i < 12 && !downloaded; i++) {
    const url = urls[i % urls.length];
    const fresh = i % urls.length === 0 && i >= urls.length; // 第二轮起全部续传
    const r = curl(url, blob, i > 0);
    if (!fs.existsSync(blob)) { console.log('[install-tailcat] attempt ' + (i + 1) + ' (' + url.split('/')[2] + ') failed, rc=' + r.status); continue; }
    const size = fs.statSync(blob).size;
    let ok = false;
    if (ext === 'tar.gz') {
      const t = spawnSync('tar', ['-tzf', blob], { stdio: 'ignore' });
      ok = t.status === 0;
    } else {
      const z = spawnSync('unzip', ['-t', blob], { stdio: 'ignore' });
      ok = z.status === 0;
    }
    if (!ok) {
      console.log('[install-tailcat] attempt ' + (i + 1) + ' incomplete (' + size + 'B), resuming...');
      continue;
    }
    console.log('[install-tailcat] downloaded ' + size + 'B from ' + url.split('/')[2]);
    downloaded = true;
    // 校验和针对下载的压缩包（checksums.txt 里的是 tarball 的 hash，不是解包后的二进制）
    if (expected) {
      const c = spawnSync('sha256sum', [blob], { stdio: 'pipe' });
      const actual = c.stdout.toString().trim().split(/\s+/)[0];
      if (actual !== expected) {
        console.error('[install-tailcat] SHA256 MISMATCH (tarball): actual=' + actual + ' expected=' + expected);
        process.exit(1);
      }
      console.log('[install-tailcat] tarball sha256 OK: ' + expected.slice(0, 16) + '...');
    }
    // 解包
    if (ext === 'tar.gz') spawnSync('tar', ['-xzf', blob, '-C', outDir], { stdio: 'inherit' });
    else spawnSync('unzip', ['-o', blob, '-d', outDir], { stdio: 'inherit' });
    const binPath = path.join(outDir, 'tailcat');
    if (fs.existsSync(binPath)) {
      fs.renameSync(binPath, final);
      fs.chmodSync(final, 0o755);
    }
    try { fs.unlinkSync(blob); } catch (e) { /* ignore */ }
    break;
  }
  if (!downloaded) {
    console.error('[install-tailcat] 全部下载源失败。手工：');
    console.error('  curl -L ' + base);
    process.exit(1);
  }

  console.log('[install-tailcat] 安装完成: ' + final);
  const v = spawnSync(final, ['--version'], { stdio: 'pipe' });
  if (v.status === 0) console.log('[install-tailcat] 自检: ' + v.stdout.toString().trim());
}

main();
