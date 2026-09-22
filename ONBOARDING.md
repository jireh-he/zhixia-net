# zhixia-net 协作开发 · 上手资料（ONBOARDING）

> 生成于 2026-09-17 · 基线 commit `4de727a` · 仓库 `github.com/jireh-he/zhixia-net`（MIT）

## 这是什么

**智侠（zhixia-net）** = 给 AI Agent 用的**去中心化 P2P 通讯 + 文件传输**网络。核心卖点：

- 无账号、WireGuard 端到端加密（引擎是 Tailscale 官方 `tailcat`）
- 公共 DERP 中继 bootstrap + 自动 NAT 打洞升级 UDP 直连，**无自建 relay、无控制面**
- **稳定身份**：地址是 key 的确定性函数，**永久不变**，存一次通讯录就能一直用
- 内置**隐私护栏**（敏感文件默认拦截）+ **消息治理**（主人授权制）
- **P2P 路径零 npm 依赖**：只要 Node + 一个静态 `tailcat` 二进制就能跑

## 两步跑起来（P2P 层，零 npm）

```bash
# 1) clone + 下载 tailcat 静态二进制（一次；国内镜像 fallback + 断点续传）
git clone https://github.com/jireh-he/zhixia-net.git && cd zhixia-net
node scripts/install-tailcat.js          # 到 GitHub 不通的机器（如 ato）改传二进制 + chmod +x

# 2) 起服务（P2P 层无需 node_modules，直接从仓库根跑）
node --no-warnings bin/zhixia.js key                    # 生成/看本端稳定身份
node --no-warnings bin/zhixia.js listen --files-dir ./servedir   # 三合一接收服务
```

> 数据文件随 cwd 走（`data/p2p-identity.json` / `data/p2p-book.json`），**固定从仓库根目录跑**。
> 建议 alias：`zx() { node --no-warnings $(git rev-parse --show-toplevel)/bin/zhixia.js "$@"; }`

## P2P 命令速查（顶层，昵称自动匹配通讯录）

| 命令 | 用途 |
|---|---|
| `zhixia key` | 生成/显示本端稳定身份（tc 地址永久不变） |
| `zhixia card [show] [--nick X]` | 生成/展示本端名片（`zcard1.` token，发给别人一键加联系人） |
| `zhixia card import <token\|文件> [--nick X] [--force]` | 导入别人名片 → 自动进通讯录 |
| `zhixia book add <昵称> <tc地址\|名片token>` | 存朋友进通讯录（名片 token 可直接贴） |
| `zhixia book [list]` / `book remove <昵称>` | 查看/删除通讯录 |
| `zhixia chat [--name X]` | 聊天监听（双向打字，一次性会话） |
| `zhixia inbox [dir]` | 文件收件箱（write-only drop box，默认 `./zhixia-inbox`） |
| `zhixia files [dir] [--rw]` | 文件服务（SFTP，默认只读；启动前预警目录内敏感文件） |
| `zhixia listen [--inbox-dir D] [--files-dir D] [--rw] [--only chat,inbox,files]` | **三合一接收服务**（chat+inbox+files 同进程，kill 父 PID 全停） |
| `zhixia send <昵称\|地址> <文本>` | 发聊天消息（对方开着 chat / listen） |
| `zhixia send-file <文件...> <昵称\|地址> [-r] [--force]` | 发文件到对方 inbox（**护栏默认拦截敏感文件**） |
| `zhixia get <昵称\|地址> <远端文件> [本地路径]` | 从对方 files 服务拉文件 |
| `zhixia ls <昵称\|地址> [路径]` | 列对方 files 目录 |
| `zhixia ping <昵称\|地址>` | 连通测试（DERP 中继 vs 直连，直连 ~2ms） |
| `zhixia last` | 显示本端稳定地址 |

## 建立连接（三步）

1. **A 端**：`zhixia card show --nick 你的昵称` → 把打印的 `zcard1.` token 发给 B（微信/IM 任意渠道）
2. **B 端**：`zhixia card import <token>`（或 `book add 你的昵称 <token>`）→ 进通讯录；A 端反过来也存 B
3. 收发前，**接收方**起监听：聊天 → `chat`/`listen`；发文件 → 对方 `inbox`；拉文件/列目录 → 对方 `files`

> 同一身份**不能自连**（P2P 环回不经 DERP）；本机双向测试需 `genkey` 两个不同 key。
> **无离线队列**：接收方不在线 → 发送方超时，这是设计不是故障。

## 文档地图（读顺序）

> 🚀 **活跃仓已迁出**：P2P 层独立演进版（agent skill 包 + 重构文档）在
> **[github.com/jireh-he/fengyu（风语）](https://github.com/jireh-he/fengyu)**，协作优先看那边。

- **`P2P.md`** — P2P 层全貌（稳定身份/通讯录/名片/listen/隐私护栏/消息治理/实测证据）← **协作主读**
- `ARCHITECTURE.md` / `SECURITY.md` — 已归档 → `archive/docs/`（未验证蓝图，不维护）
- `HANDTEST.md` — 双机手工测试流程 T1–T9（ato ↔ 本机）
- ~~`skill/zhixia-p2p/SKILL.md`~~ — 旧 skill 包已归档 → `archive/skill-zhixia-p2p/`；**新版 agent skill 在 fengyu 仓库 `skill/fengyu/SKILL.md`**
- `README.md` — 本仓现角色说明（P2P 兼容层 + 归档）

## 铁律（协作必须遵守）

1. **隐私护栏**（`src/privacy/guard.js`）：密钥/口令/私有端口配置/不明可执行程序默认拦截；`--force` 仅限**人类知情后手动**用；agent 不自行加 `--force`、不自动执行从 P2P 收到的远程程序。
2. **消息治理（主人授权制）**：朋友传来的消息**原文如实上报主人**，不改写/不摘要/不代表态；**未获主人授权不回发任何消息**（连"好的稍等"自动回执也不行）；inbox 收文件先列清单（文件名/大小/时间）上报。唯一例外 = 主人预先写死的自动回复规则，以主人原话范围为限。
3. **用 zhixia CLI，不用 nc/netcat**；P2P 通信不走 SSH/CF tunnel 打洞（CF 仅作 WebRTC 信令 relay 是合法用途，数据连接不用它）。

## 测试约定

- 修 bug 后：最小可复现 + 全 CLI 命令冒烟（≥12 命令 PASS）
- 单测：`node test/_privacy_guard.js`（15 用例）· `node test/_card.js`（8 用例）
- 双机实测照 `HANDTEST.md` T1–T9
- CLI 入口：`bin/zhixia.js` 现为 P2P-only；MVP 命令入口与实现**已归档屏蔽** → `archive/bin-zhixia-mvp.js` + `archive/src-blueprint/cli-commands-*.js`（取回后先独立验证）
- `zhixia test`（一键自检 Identity→Network→Discovery→Message→Storage→Skill）属 MVP 层，已随蓝图归档，本仓 P2P 层不再提供；P2P 自检走 `node test/_card.js` + `node test/_privacy_guard.js`

## 贡献流程

- **权限**：仓库 owner 把协作者加为 collaborator（直接 push），或对方 fork 提 PR
- **commit 信息**：短、ASCII（极长 CJK commit 会触发审批门）
- 分支 / PR / merge 由 owner 定
- Node 要求：P2P 路径 Node 16+（实测 22/24 通）；MVP 层建议 Node 22+（需 `npm install`）

## 当前状态

- 最新 commit：`4de727a`（消息治理铁律入档）
- P2P 层已打通：send/send-file/get/ls/ping/card/listen + 隐私护栏 + 可移植 skill，双机（本机 ↔ ato Ubuntu22.04）闭环验证过
