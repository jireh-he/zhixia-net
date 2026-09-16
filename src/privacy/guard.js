'use strict';
/**
 * P2P 隐私护栏 — 敏感文件默认拦截，禁止流入 P2P 通道
 *
 * 三层规则（对每个待发送文件逐一判定）:
 *   1. 文件名规则：密钥/证书材料、SSH 私钥、.env 系凭据、口令文件、密钥库/钱包、
 *      点配置目录（.ssh/.aws/.gnupg/.config）下的文件
 *   2. 内容嗅探（≤512KB 文本）：PRIVATE KEY 块、明文口令/密钥字段（password/secret_key/
 *      api_key/access_key/token=…）、≥3 处 IP:port（疑似私有服务器端口/内网地址）
 *   3. 可执行二进制魔数：ELF / Windows PE / Mach-O（对应"不明程序"禁发；
 *      图片/文档/压缩包不拦——只认可执行魔数，不做"NUL 即二进制"误伤）
 *
 * 白放行：*.pub（公钥）、*.crt（证书）——公开材料天然可共享。
 *
 * 越权机制：--force 仅限人类用户明确知情后手动使用；
 * 智能体（agent）不得自行添加 --force，也不得自动执行收到的任何远程文件。
 */
const fs = require('fs');
const path = require('path');

// ---------- 文件名规则 ----------
const NAME_RULES = [
  [/\.(pem|key|jks|keystore|p12|pfx|ppk|der|pkcs8|csr|p8|p7b)\b/i, '密钥/证书材料'],
  [/^id_(rsa|dsa|ecdsa|ed25519)$/i, 'SSH 私钥（id_rsa 等，.pub 公钥放行）'],
  [/private\.json$/i, '引擎私钥材料（*.private.json）'],
  [/^\.env/i, '环境凭据文件（.env / .env.local / .env.production…）'],
  [/^credentials/i, '凭据文件（credentials*）'],
  [/^secrets?(\.json)?$/i, '秘密文件（secret/secrets）'],
  [/\.(pwd|password|pass)$|\.pass\b/i, '口令文件'],
  [/^(shadow|passwd|suid|master\.password)$/, '系统口令文件'],
  [/\b(keychain|key\.dat|wallet\.dat|\.wallet)$|\bkeychain\b/i, '密钥库/钱包'],
];
// 路径级：点配置目录下的文件（绝对/相对路径均可命中）
const DOTDIR_RE = /[\\/]\.(ssh|aws|gnupg|config|docker|kube)\b/i;
// 白放行（优先于拦截）
const ALLOW_RE = [/\.pub$/i, /\.crt$/i];

// ---------- 内容嗅探 ----------
const SNIFF_KEY_BLOCK = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;
// 字段名：env/yaml/toml（行首）+ json 内联都能命中；后跟 = 或 : + 非占位符值
const CRED_FIELD_RE = /\b(password|passwd|pwd|secret[-_]?key|api[-_]?key|access[-_]?key|auth[-_]?token|client[-_]?secret|token)\b\s*["']?\s*[:=]\s*["']?([^\s"'=,}{]{3,})/gi;
// 占位符值不视为真实凭据（避免文档/模板误伤）
const CRED_PLACEHOLDER = /^(your|changeme|placeholder|placeholder[-_]?text|null|undefined|true|false|none|todo|<|>|\*+|xxxx*|abc123|123456|sk-xxx|example)/i;
const IP_PORT_RE = /\b(?:\d{1,3}\.){3}\d{1,3}:\d{2,5}\b/g;
const SNIFF_LIMIT = 512 * 1024; // 只嗅探前 512KB，大文件按名称规则兜底

/** 可执行二进制魔数检测 → 返回类型名或 null */
function isExecutable(buf) {
  if (buf.length < 4) return null;
  if (buf[0] === 0x7f && buf.toString('latin1', 1, 4) === 'ELF') return 'ELF 可执行程序';
  if (buf[0] === 0x4d && buf[1] === 0x5a && buf.length > 0x40) {
    const peOff = buf.readUInt32LE(0x3c);
    if (peOff > 0 && peOff + 4 <= buf.length && buf.toString('latin1', peOff, peOff + 4) === 'PE\0\0') {
      return 'Windows PE 可执行程序';
    }
    return null;
  }
  const be = buf.readUInt32BE(0);
  if (be === 0xcafebabe || be === 0xfeedface || be === 0xfeedfacf) return 'Mach-O 可执行程序';
  return null;
}

/** 文本内容嗅探 → 原因数组 */
function sniffText(text) {
  const why = [];
  if (SNIFF_KEY_BLOCK.test(text)) why.push('文件内含 PRIVATE KEY 私钥块');
  const hitFields = new Set();
  let m;
  while ((m = CRED_FIELD_RE.exec(text))) {
    if (CRED_PLACEHOLDER.test(m[2])) continue;
    hitFields.add(m[1]);
    if (hitFields.size >= 2) break;
  }
  if (hitFields.size) why.push('文件内含明文口令/密钥字段（' + [...hitFields].join('/') + '）');
  const ipm = text.match(IP_PORT_RE) || [];
  const uniq = new Set(ipm);
  if (uniq.size >= 3) why.push('疑似含私有服务器端口/内网地址（' + uniq.size + ' 处 IP:port）');
  return why;
}

function readHead(abs) {
  try {
    const fd = fs.openSync(abs, 'r');
    let n;
    try {
      n = Math.min(fs.fstatSync(fd).size, SNIFF_LIMIT);
      const buf = Buffer.alloc(n);
      const got = fs.readSync(fd, buf, 0, n, 0);
      return buf.slice(0, got);
    } finally { fs.closeSync(fd); }
  } catch { return null; }
}

/**
 * 检查单个文件 → { ok, why[], allowed }
 * allowed=true 表示走了白放行（公钥/证书）。
 */
function checkFile(f) {
  const abs = path.resolve(f);
  let st;
  try { st = fs.statSync(abs); } catch { return { ok: false, why: ['文件不存在: ' + f] }; }
  if (st.isDirectory()) return { ok: false, why: ['「' + f + '」是目录（加 -r 递归发送时由护栏逐文件检查）'] };

  const base = path.basename(abs);
  const allowed = ALLOW_RE.some(r => r.test(base));
  const why = [];
  if (!allowed) {
    for (const [re, label] of NAME_RULES) if (re.test(base)) why.push(label);
    if (DOTDIR_RE.test(abs.replace(/\\/g, '/'))) why.push('位于点配置目录（.ssh/.aws/.gnupg/.config/.docker/.kube），通常含凭据');
  }
  // 内容/魔数检查独立于名称规则（小文件都做，命中叠加；大文件跳过——名称规则已兜底）
  if (!allowed && st.isFile() && st.size <= SNIFF_LIMIT) {
    const head = readHead(abs);
    if (head && head.length) {
      const exec = isExecutable(head);
      if (exec) why.push('可执行程序（' + exec + '）——不明程序禁止外发');
      why.push(...sniffText(head.toString('utf8')));
    }
  }
  return { ok: why.length === 0, why, allowed: allowed && why.length === 0 };
}

/** 递归展开（-r 目录发送时逐文件过护栏） */
function expand(files) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else out.push(p);
    }
  };
  for (const f of files) {
    let st;
    try { st = fs.statSync(path.resolve(f)); } catch { out.push(f); continue; }
    if (st.isDirectory()) walk(f); else out.push(f);
  }
  return out;
}

/**
 * 批量检查。recursive=true 时先展开目录再逐文件检查。
 * → { blocked: [{file, why[]}], checked: n }
 * 策略：任一文件被拦 → 整次 send-file 全部不发（避免混合发送泄露上下文），
 * 由人类决定删掉敏感项重发，或 --force 知情越过。
 */
function checkAll(files, opts = {}) {
  const list = opts.recursive ? expand(files) : files;
  const blocked = [];
  for (const f of list) {
    const r = checkFile(f);
    if (!r.ok) blocked.push({ file: f, why: r.why });
  }
  return { blocked, checked: list.length };
}

/**
 * serve 目录前浅扫描（只列 top-level）→ [{name, why[]}]
 * 用于 zhixia files / inbox 启动时警告"对方可枚举到哪些敏感文件"。
 */
function scanDir(dir) {
  const hits = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return hits; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      // 目录本身：点配置目录 / keys 目录直接命中
      if (DOTDIR_RE.test(p.replace(/\\/g, '/')) || /(^|\/)(keys?|secrets?|credentials?)(\/|$)/i.test(p)) {
        hits.push({ name: e.name + '/', why: ['敏感目录（对方可递归 ls 枚举其内文件）'] });
      }
      continue;
    }
    const r = checkFile(p);
    if (!r.ok && !r.why.includes('文件不存在')) hits.push({ name: e.name, why: r.why });
  }
  return hits;
}

exports.NAME_RULES = NAME_RULES;
exports.checkFile = checkFile;
exports.checkAll = checkAll;
exports.expand = expand;
exports.scanDir = scanDir;
exports.isExecutable = isExecutable;
