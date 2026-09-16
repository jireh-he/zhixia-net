#!/usr/bin/env sh
# zhixia-p2p 一键安装 — 让任何终端/AI agent 获得 P2P 聊天 & 文件传输能力
#
# 用法：
#   sh skill/zhixia-p2p/install.sh            # 装到当前 zhixia-net 仓库根目录（开发模式）
#   ZHIXIA_HOME=$HOME/.zhixia sh skill/zhixia-p2p/install.sh   # 独立安装到 ~/.zhixia
#
# 依赖：git + node(>=16)。P2P 路径零 npm 依赖（静态 tailcat 二进制 + Node 内置模块）。
set -eu

REPO_URL="${ZHIXIA_REPO:-https://github.com/jireh-he/zhixia-net.git}"

# 1) 定位工作目录：在仓库内跑 → 原地；否则 clone 到 ZHIXIA_HOME
in_repo=0
if [ -f "bin/zhixia.js" ] && [ -f "scripts/install-tailcat.js" ]; then in_repo=1; fi

if [ "$in_repo" = "1" ]; then
  ROOT="$(pwd)"
else
  ROOT="${ZHIXIA_HOME:-$HOME/.zhixia}"
  if [ ! -d "$ROOT/.git" ]; then
    echo "[zhixia-p2p] cloning $REPO_URL → $ROOT"
    git clone --depth 1 "$REPO_URL" "$ROOT"
  fi
fi
cd "$ROOT"

# 2) node 检查（P2P 路径 Node 16+ 即可；tailcat 静态二进制与 Node 版本无关）
if ! command -v node >/dev/null 2>&1; then
  echo "[zhixia-p2p] ✗ 未找到 node。P2P 能力需要 Node >= 16（只需 node，无需 npm install）。" >&2
  exit 1
fi
NODE_VER="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_VER" -lt 16 ]; then
  echo "[zhixia-p2p] ✗ Node $(node -v) 过低，需要 >= 16" >&2
  exit 1
fi

# 3) 下载 tailcat 静态二进制（国内镜像 fallback + 续传 + sha256）
echo "[zhixia-p2p] 安装 tailcat 引擎（bin/tailcat/）..."
node scripts/install-tailcat.js

# 4) 验证 P2P 路径（零 npm 依赖：不跑 npm install 也能通过）
echo "[zhixia-p2p] 验证 P2P 命令..."
node --no-warnings bin/zhixia.js p2p-help >/dev/null
node --no-warnings bin/zhixia.js last

# 5) 可选：MVP 层（yargs/hyperswarm 等）才需要 npm install
if [ ! -d node_modules ]; then
  echo "[zhixia-p2p] 提示：P2P 已就绪。MVP 层（online/storage/bootstrap-server 等）可选:"
  echo "             cd $ROOT && npm install"
fi

echo "[zhixia-p2p] ✓ 安装完成。用法（在 $ROOT 下）:"
echo "  node --no-warnings bin/zhixia.js key      # 生成本端稳定地址"
echo "  node --no-warnings bin/zhixia.js p2p-help  # 全部命令"
