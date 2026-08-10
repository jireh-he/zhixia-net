#!/usr/bin/env node
// 智侠网主入口
// 根据命令行参数决定启动模式

const { spawn } = require('child_process');
const path = require('path');

const mode = process.argv[2];

if (mode === 'daemon') {
  // 直接启动守护进程
  require('./daemon/index.js');
} else {
  // 默认启动 CLI
  require('./cli/index.js');
}
