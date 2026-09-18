#!/usr/bin/env node
'use strict';
// zhixia CLI — 入口只保留 P2P 层（tailcat 第四传输层），MVP 层已从命令表面撤掉。
// P2P 命令零 npm 依赖（纯 stdlib + bin/tailcat/ 静态二进制），fresh clone 不跑 npm install 也能用。
//
// MVP 层命令（init/status/online/peers/publish/reputation/balance/storage/market/
// proposal/node/skills/skill/config/search/test/bootstrap-server/version 等）
// 已从本入口移除；实现代码保留在 src/cli/commands/ 未删，需要时从 git 历史或旧版入口捡回。
// send / get 与旧 MVP 层同名，现统一按 P2P 目标形态处理（tc 地址 / 通讯录昵称）。

const p2p = require('../src/cli/commands/p2p-cmd');
const P2P_OWN = p2p.P2P_OWN; // key/book/chat/inbox/files/listen/card/send-file/last/ls/ping
const argv = process.argv;
const cmd = argv[2];

// P2P 专有命令 + 同名 send/get → 直接 P2P 解析器
if (cmd === 'send' || cmd === 'get' || P2P_OWN.includes(cmd)) {
  p2p.main(argv.slice(2));
  return; // CJS 顶层 return；监听类命令靠事件循环保活，不能 process.exit
}

// 旧层级名提示（link / tailcat 均已撤掉，命令直接挂顶层）
if (cmd === 'link' || cmd === 'tailcat') {
  console.log('[zhixia] "' + cmd + '" 这一层已撤掉：命令直接挂顶层。');
  console.log('        例: zhixia send 小美 "hi" / zhixia book add 小美 <tc地址> / zhixia key');
  process.exit(0);
}

// MVP 层命令已撤 → 明确提示而不是静默 yargs 报错
if (cmd && !['-h', '--help', 'help', 'p2p-help'].includes(cmd)) {
  console.log('[zhixia] "' + cmd + '" 不属于 P2P 命令层（MVP 层命令已撤，实现仍在 src/ 里未删）。');
  console.log('');
}
p2p.main(['help']);
if (!cmd || ['-h', '--help', 'help', 'p2p-help'].includes(cmd)) process.exit(0);
process.exit(1);
