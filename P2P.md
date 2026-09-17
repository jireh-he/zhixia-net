# zhixia P2P 顶层命令 — 聊天 & 文件传输（第四传输层）

引擎：[Tailcat](https://github.com/tailscale/tailcat)（Tailscale 官方开源，7.3k★）静态二进制。
WireGuard 端到端加密 + 公共免费 DERP 中继 bootstrap + 自动 NAT 打洞升级 UDP 直连（实测 IPv6 直连 1.8ms）。
纯 P2P、无账号、无自建 relay，符合 zhixia 铁律。**命令直接挂 zhixia 顶层，不套任何中间层**，CLI 表面不含 tailcat 字样。

## 安装

```bash
cd /home/hyl/zhixia-net
node --no-warnings scripts/install-tailcat.js
# → bin/tailcat/tailcat-<平台>（静态链接 18MB，ato CentOS 7 直接可跑）
```

脚本特性：官方 GitHub release + 4 个国内镜像 fallback、断点续传循环、sha256 校验。
也可 `export ZHIXIA_TAILCAT=/path/to/binary` 显式指定。

## 命令（全部顶层，zhixia 直接接）

```bash
# 身份 / 通讯录
zhixia key                        生成/显示本端稳定 P2P 身份（地址永久不变）
zhixia book add <昵称> <tc地址>   把朋友存进通讯录（对方先跑 zhixia key 把他的稳定地址给你）
zhixia book remove <昵称>
zhixia book [list]
zhixia card [show] [--nick X]   生成/展示本端名片（zcard1. token，发给对方一键加联系人）
zhixia card import <token|文件> [--nick X] [--force]   导入别人名片 → 进通讯录

# 监听（自动用稳定身份，地址不变）
zhixia chat [--name X]            聊天监听（一次性会话，连上后双向打字）
zhixia inbox [dir]               文件收件箱（write-only drop box，默认 ./zhixia-inbox）
zhixia files [dir] [--rw]        文件服务（SFTP，默认只读）
zhixia listen [--inbox-dir D] [--files-dir D] [--rw] [--only chat,files]
                                 三合一接收服务：chat+inbox+files 同一进程
                                 （接收端后台只挂这一个；kill 该 PID 全停）

# 访问朋友（target 可以是昵称或 tc 地址，昵称自动匹配通讯录）
zhixia send <昵称|地址> <文本>
zhixia send-file <文件...> <昵称|地址> [-r]
zhixia get <昵称|地址> <远端文件> [本地路径]
zhixia ls <昵称|地址> [路径]
zhixia ping <昵称|地址>

# 辅助
zhixia last                      显示本端稳定地址
```

## send / get 与 MVP 层同名 → 智能路由

`zhixia send` / `zhixia get` 与 MVP 层命令（`send <zid> <msg>`、`get <cid>`）同名。
`bin/zhixia.js` 顶部按**目标形态**分流：

| 目标形态 | 路由到 |
|---|---|
| `tc...` 长地址 / 通讯录里已有昵称 | P2P（tailcat 引擎） |
| `zid:...` / 短 CID | MVP（消息层 / 分布式存储层） |

其余 P2P 专有词（`key/book/chat/inbox/files/send-file/last/ls/ping`）与 MVP 不撞名，直接顶层拦截。

## 核心设计：稳定身份 + 通讯录

引擎 `genkey` 生成**持久身份 key**（`~/.config/tailcat/keys/<name>.private.json`），
对应 tc 地址是 key 的确定性函数 → **地址永久稳定不变**。

```
zhixia key
  → 本端稳定地址: tcpGFwWCBQoXkT9iFq...（存 data/p2p-identity.json）
  → 把地址发给朋友，他存进他的通讯录
```

通讯录 `data/p2p-book.json`：`{ 昵称: { address, ts } }`，一次存永久有效。
之后 `send/send-file/get/ls/ping` 的 target 都能写**昵称**，自动匹配地址：

```
zhixia send 小美 "hi"            # 昵称 → 通讯录地址 → P2P 送达
zhixia send-file 报告.pdf 小美   # 发文件到对方 inbox
zhixia get 小美 report.pdf       # 从对方 files 服务拉文件
```

## 名片（一条 token 加联系人，AI agent 友好）

「分享名片」= 把**稳定身份**编码成一条可复制的 token（`zcard1.<base64url(JSON)>`），
对方一条命令就能把你存进通讯录——**人和 AI agent 都适用**（agent 会读 CLI 文本输出/文件）。

```
# 你: 生成名片
zhixia card show --nick 小何
  → zcard1.eyJ2IjoxLCJuaWNr...（token，只含 昵称+稳定地址 两项公开信息，无隐私材料）

# 对方: 导入（token 可直接粘贴，也可放在文件里 zhixia card import 名片.txt）
zhixia card import zcard1.eyJ2IjoxLCJuaWNr...
  → 昵称+地址自动写进通讯录 data/p2p-book.json
  → 之后 zhixia send 小何 "hi" 直接通
```

设计要点：
- **只含公开信息**：稳定地址本来就是拿来分享的，名片不夹带任何密钥/口令/端口
- **昵称随名片走**：token 里带 `nick`，对方 `card import` 免填 `--nick`；用 `--nick` 可改名
- **昵称冲突默认拒**：同名不同地址 → 提示加 `--force`（人工知情覆盖）
- **宽容解析**：`card import` / `book add` 都能接受 zcard1 token、裸 tc 地址、或**夹带 token 的自由文本**（正则提取）
- `book add <昵称> <名片token>` 也可直接吃名片（`parseCard` 同一套解析）
- 单测 `node test/_card.js`（8 用例：round-trip / 自由文本提取 / 伪造与版本隔离拒绝）

## 实测证据（2026-09-17）

| 链路 | 结果 |
|---|---|
| 双身份 `zhixia send 小美`（顶层，昵称自动匹配） | ✓ 送达对方终端 |
| 顶层 `send-file` / inbox | ✓ 文件送达（drop box 加时间戳后缀） |
| 顶层 `files` + `ls` + `get` | ✓ 列目录 + 拉取，内容一致 |
| 顶层 `ping` | ✓ **IPv6 直连 1.8ms**（magicsock 打洞，非 DERP 中继） |
| `send zid:...` / `get <cid>` 路由 | ✓ 正确分流到 MVP 层，不崩 |
| 稳定身份 | ✓ 同 key 每次起监听打印的地址完全一致 |

## 行为注意

- `chat` 是**一次性**会话（netcat 语义）：收完一条连接进程退出；持续收文件用 `inbox`/`files`
- 同一身份不能自连（本端 key 同时监听+发送 → DERP ping 超时，预期行为）
- `recv` 收件箱 write-only：不能列目录/读回；列目录拉文件用 `files`（SFTP 原生）
- 地址交换走任意渠道（微信/IM 传字符串），无需账号

## 隐私护栏（src/privacy/guard.js，send-file 默认生效）

智能体/用户 **不得私自**把隐私文件发给对方。护栏三层规则，任一命中即整批不发：

| 层 | 拦什么 | 命中依据 |
|---|---|---|
| 文件名 | 密钥/证书（*.key/*.pem/*.p12/*.csr…）、SSH 私钥（id_rsa，*.pub 放行）、.env* 凭据、credentials*/secret(s)、口令文件、密钥库/钱包、`.ssh/.aws/.gnupg/.config/.docker/.kube` 目录内文件 | 名称规则 |
| 内容嗅探（≤512KB） | PRIVATE KEY 块、明文口令/密钥字段（password/secret_key/token=…，占位符值放行）、≥3 处 IP:port（私有服务器端口/内网地址） | 文本扫描 |
| 可执行魔数 | ELF / Windows PE / Mach-O（"不明程序"禁发；图片/文档/压缩包不误伤） | 文件头 |

白放行：`*.pub`（公钥）、`*.crt`（证书）——公开材料天然可共享。

- 拦截发生在 **P2P 连接之前**（本地判定，零网络开销），整批不发避免混合泄露
- `--force` 仅限**人类知情**手动越过；智能体不得自行加 `--force`，也不得自动执行收到的任何远程文件
- `zhixia files` 启动前浅扫描服务目录，敏感条目预警（对方可 ls 枚举）
- 单测：`node test/_privacy_guard.js`（15 用例全过）

## 代码结构

```
bin/tailcat/                     # 引擎二进制（gitignore，install-tailcat.js 下载）
scripts/install-tailcat.js       # 自动下载（镜像 fallback + 续传 + sha256）
src/tailcat/adapter.js           # 引擎适配层：spawn + genkey + 地址解析 + --key 注入
src/cli/commands/p2p-cmd.js      # P2P 顶层命令 + 通讯录 + 昵称解析 + send/get 路由谓词
bin/zhixia.js                    # 顶部拦截：P2P 专有词直接顶层；send/get 按目标形态路由；link/tailcat 提示已撤层
data/p2p-identity.json           # 本端稳定身份（gitignore）
data/p2p-book.json               # 通讯录（gitignore，每台机器自己维护自己的朋友）
```

**坑（已绕开/记录）**：
1. yargs 17 strict 模式下 `cmd <sub> [rest...]` 变参被当 unknown argument 拒绝 → P2P 走独立 argv 解析器
2. `genkey` 已存在时 RC=0 但输出无地址行（只有 "already exists" 日志）→ 必须先判 existed 再取地址
3. 稳定 key 输出前缀 `listening with saved key "x":` 不是一次性的 `new address:` → 地址正则不依赖前缀措辞，直接抓 `\btc[20+ chars]` token
4. tc 地址可能被 stdout chunk 截断 → 监听输出用 600 字符滑动窗口累积匹配
5. `tailcat cp` 本地源路径必须是裸文件名（含 `/` 或 `./` 报 "invalid DNS name"）
