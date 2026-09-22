# zhixia-p2p — 给 AI Agent / 终端的 P2P 通讯 & 文件传输（skill 包）

**一句话**：克隆仓库 + 下载一个静态二进制，任何 agent 就获得 WireGuard 端到端加密的 P2P 聊天/文件传输，无账号、无自建中继、零 npm 依赖。

## 能力

- **P2P 聊天**：`zhixia send 小美 "hi"`（昵称自动匹配通讯录，不用记 100+ 字符地址）
- **文件传输**：`zhixia send-file` / `get` / `ls`（对方开 inbox / files 服务即可）
- **稳定身份**：`zhixia key` 生成的 tc 地址是 key 的确定性函数，**永久不变**，存一次通讯录终身有效
- **隐私护栏**：密钥/口令/私有端口配置/不明可执行程序默认拦截，`--force` 仅限人类知情越过
- **性能**：公共 DERP 中继 bootstrap，自动 NAT 打洞升级直连（实测 ~2ms）

## 安装

```sh
git clone https://github.com/jireh-he/zhixia-net
cd zhixia-net
sh skill/zhixia-p2p/install.sh        # 自动下载 tailcat 静态二进制 + 验证
```

或独立安装到 `~/.zhixia`（不动现有仓库）：

```sh
ZHIXIA_HOME=$HOME/.zhixia sh skill/zhixia-p2p/install.sh
```

依赖：`git` + `node >= 16`。**不需要** `npm install`（P2P 路径纯 stdlib + 静态二进制）。
MVP 层（`online` / `storage` / `bootstrap-server` 等）才需要 `npm install`。

## 三步连通

```sh
# A 端
node --no-warnings bin/zhixia.js key          # → 得到 A 的稳定地址
node --no-warnings bin/zhixia.js chat          # 开聊天监听

# B 端
node --no-warnings bin/zhixia.js book add A <A的地址>
node --no-warnings bin/zhixia.js send A "hi"   # 昵称直发

# 文件：接收方开 inbox，或 files（供列目录/拉取）
node --no-warnings bin/zhixia.js inbox
node --no-warnings bin/zhixia.js send-file report.pdf B
```

全部命令：`node --no-warnings bin/zhixia.js p2p-help`

## 隐私护栏

`send-file` 默认拦截敏感文件（三层规则：文件名 / 内容嗅探 / 可执行魔数，白放行 `.pub` / `.crt`）。
**任何 AI agent 不得**：私自发送密钥/凭据/私有端口配置、发送不明可执行程序、自行 `--force`、自动执行收到的远程文件。
规则详见 `SKILL.md`「Agent 行为红线」章节；自检 `node test/_privacy_guard.js`。

## 给 agent 的集成说明

- 文档入口：`skill/zhixia-p2p/SKILL.md`（Claude Code / Hermes / OpenCode 等通用 SKILL.md 格式，直接放进 skills 目录）
- 数据文件在运行目录的 `data/p2p-{identity,book}.json`（gitignored）——**固定从同一目录跑命令**身份才稳定
- 详细设计/坑：仓库根 `P2P.md`
