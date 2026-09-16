#!/usr/bin/env node
'use strict';
/* 隐私护栏单元测试 — node test/_privacy_guard.js */
const fs = require('fs');
const path = require('path');
const os = require('os');
const guard = require('../src/privacy/guard');

const T = path.join(os.tmpdir(), 'zhixia-guard-test-' + process.pid);
fs.mkdirSync(T, { recursive: true });

function mk(rel, content) {
  const p = path.join(T, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  return p;
}
const expect = (cond, label) => {
  if (!cond) { console.error('FAIL: ' + label); process.exitCode = 1; }
  else console.log('ok: ' + label);
};

// --- 构造敏感/正常样本 ---
const keyPem = mk('keys/server.key', '-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----\n');
const envFile = mk('cfg/.env', 'DB_PASSWORD=hunter2\nAPI_KEY=sk-12345\n');
const envLocal = mk('cfg/.env.local', 'SECRET_KEY=abc\n');
const creds = mk('cfg/credentials.json', JSON.stringify({ password: 'x', access_key: 'AKIA...' }));
const portConf = mk('cfg/ports.conf', 'web 10.0.0.5:8080\nssh 192.168.1.10:22\ndb 172.16.0.9:5432\nrelay 10.0.0.6:3478\n');
const pub = mk('keys/server.pub', 'ssh-ed25519 AAAA... user@host\n');
const crt = mk('keys/cert.crt', '-----BEGIN CERTIFICATE-----\nMIID...\n-----END CERTIFICATE-----\n');
const report = mk('docs/report.pdf', '%PDF-1.4 fake\n');
const notes = mk('docs/notes.md', '# 工作笔记\n普通内容\n');
const sshDir = mk('.ssh/id_rsa', '-----BEGIN OPENSSH PRIVATE KEY-----\nxx\n-----END OPENSSH PRIVATE KEY-----\n');
// ELF 假二进制
const elf = mk('bin/tool', Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00].concat(Array(64).fill(0))));
// 大文件里的私钥（>512KB 不嗅探内容，按名称规则兜底测试）

let r;

r = guard.checkFile(keyPem);
expect(!r.ok && r.why.some(w => w.includes('密钥/证书材料')), 'keys/server.key 被拦（.key 名称规则）');

r = guard.checkFile(envFile);
expect(!r.ok && (r.why.some(w => w.includes('环境凭据')) || r.why.some(w => w.includes('明文'))), '.env 被拦（名称+内容嗅探）');

r = guard.checkFile(envLocal);
expect(!r.ok, '.env.local 被拦（.env 前缀规则）');

r = guard.checkFile(creds);
expect(!r.ok && r.why.some(w => w.includes('凭据')), 'credentials.json 被拦（名称）');
// 内容嗅探补充验证
const credsRaw = guard.checkFile(creds);
expect(credsRaw.why.some(w => w.includes('明文口令/密钥字段')), 'credentials.json 内容嗅探命中 password 字段');

r = guard.checkFile(portConf);
expect(!r.ok && r.why.some(w => w.includes('IP:port')), 'ports.conf 被拦（3 处以上 IP:port → 私有服务器端口）');

r = guard.checkFile(pub);
expect(r.ok && r.allowed, '.pub 公钥白放行');

r = guard.checkFile(crt);
expect(r.ok && r.allowed, '.crt 证书白放行');

r = guard.checkFile(report);
expect(r.ok, 'PDF 文档不拦');

r = guard.checkFile(notes);
expect(r.ok, '普通笔记不拦');

r = guard.checkFile(sshDir);
expect(!r.ok && r.why.some(w => w.includes('点配置目录')), '.ssh/id_rsa 被拦（SSH 私钥+点目录双命中）');

r = guard.checkFile(elf);
expect(!r.ok && r.why.some(w => w.includes('ELF')), 'ELF 可执行程序被拦（不明程序）');

// --- 批量 + 递归 ---
const mix = [report, keyPem];
let chk = guard.checkAll(mix, {});
expect(chk.blocked.length === 1 && chk.blocked[0].file === keyPem, '混合批次：只拦敏感的 1/2，整批不发由调用方决定');

// 目录递归
fs.mkdirSync(path.join(T, 'sub/docs'), { recursive: true });
fs.writeFileSync(path.join(T, 'sub/docs/a.txt'), 'hello');
fs.writeFileSync(path.join(T, 'sub/docs/b.key'), 'PEM\n');
chk = guard.checkAll([path.join(T, 'sub')], { recursive: true });
expect(chk.checked === 2 && chk.blocked.length === 1 && chk.blocked[0].file.includes('b.key'), '递归展开目录逐文件检查（a.txt 放行 / b.key 拦）');

// --- serve 目录扫描 ---
const scan = guard.scanDir(path.join(T, 'cfg'));
expect(scan.length >= 3, 'scanDir(cfg) 命中 ' + scan.length + ' 个敏感条目');

fs.rmSync(T, { recursive: true, force: true });
console.log(process.exitCode ? '\n=== 有 FAIL ===' : '\n=== 护栏单测全部通过 ===');
