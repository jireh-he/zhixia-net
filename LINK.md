# zhixia link — P2P 聊天 & 文件传输（第四传输层）

引擎：[Tailcat](https://github.com/tailscale/tailcat)（Tailscale 官方开源，7.3k★）静态二进制。
WireGuard 端到端加密 + 公共免费 DERP 中继 bootstrap + 自动 NAT 打洞升级 UDP 直连（实测 IPv6 直连 2.7ms）。
纯 P2P、无账号、无自建 relay，符合 zhixia 铁律。CLI 表面全用 `zhixia link`，不含 tailcat 字样。

## 安装

```bash
cd /home/hyl/zhixia-net
node --no-warnings scripts/install-tailcat.js
# → bin/tailcat/tailcat-<平台>（静态链接 18MB，ato CentOS 7 直接可跑）
```

脚本特性：官方 GitHub release + 4 个国内镜像 fallback、断点续传循环、sha256 校验。
也可 `export ZHIXIA_TAILCAT=/path/to/binary` 显式指定。

## 核心设计：稳定身份 + 通讯录

引擎的 `genkey` 生成**持久身份 key**（`~/.config/tailcat/keys/<name>.private.json`），
对应 tc 地址是 key 的确定性函数 → **地址永久稳定不变**。

```
zhixia link key
  → 本端稳定地址: tcpGFwWCBQoXkT9iFq...（存 data/link-identity.json）
  → 把地址发给朋友，他存进他的通讯录
```

通讯录 `data/link-book.json`：`{ 昵称: { address, ts } }`，一次存永久有效。
之后所有访问命令 target 位置都能写**昵称**，自动匹配地址：

```
zhixia link send 小美 "hi"          # 昵称 → 通讯录地址 → P2P 送达
zhixia link send-file 报告.pdf 小美  # 发文件到对方 inbox
zhixia link get 小美 report.pdf      # 从对方 files 服务拉文件
zhixia link ls 小美
zhixia link ping 小美
# 也兼容直接写 tc 地址
```

## 全部子命令

```bash
# 身份 / 通讯录
zhixia link key                       生成/显示本端稳定身份
zhixia link book add <昵称> <tc地址>   把朋友存进通讯录
zhixia link book remove <昵称>
zhixia link book [list]

# 监听（自动用稳定身份，地址不变）
zhixia link chat [--name X]           聊天监听（一次性会话，连上后双向打字）
zhixia link inbox [dir]               文件收件箱（write-only drop box，默认 ./zhixia-inbox）
zhixia link files [dir] [--rw]        文件服务（SFTP，默认只读）

# 访问朋友（昵称或 tc 地址）
zhixia link send <昵称|地址> <文本>
zhixia link send-file <文件...> <昵称|地址> [-r]
zhixia link get <昵称|地址> <远端文件> [本地路径]
zhixia link ls <昵称|地址> [路径]
zhixia link ping <昵称|地址>

# 辅助
zhixia link last                      显示本端稳定地址
```

## 实测证据（2026-09-16）

| 链路 | 结果 |
|---|---|
| 双身份 `link send 小美`（zhixia-default → xiaomei） | ✓ 昵称自动匹配，消息送达对方终端 |
| `link send-file` / inbox | ✓ 文件送达（drop box 加时间戳后缀） |
| `link files` + `ls` + `get` | ✓ 列目录 + 拉取，内容一致 |
| `link ping` | ✓ **IPv6 直连 2.7ms**（magicsock 打洞升级，非 DERP 中继） |
| 稳定身份 | ✓ 同 key 每次起监听打印的地址完全一致 |

## 行为注意

- `chat` 是**一次性**会话（netcat 语义）：收完一条连接进程退出；要持续收文件用 `inbox`/`files`
- 同一身份不能自连（本端 key 同时监听+发送 → DERP ping 超时，预期行为）
- `recv` 收件箱 write-only：不能列目录/读回；列目录拉文件用 `files`（SFTP 原生）
- 地址交换走任意渠道（微信/IM 传字符串），无需账号

## 代码结构

```
bin/tailcat/                     # 引擎二进制（gitignore，install-tailcat.js 下载）
scripts/install-tailcat.js       # 自动下载（镜像 fallback + 续传 + sha256）
src/tailcat/adapter.js           # 引擎适配层：spawn + genkey + 地址解析 + --key 注入
src/cli/commands/link-cmd.js     # link 子命令组 + 通讯录 + 昵称解析 + 独立 argv 解析器
bin/zhixia.js                    # 顶部拦截 argv[2]==='link' → link-cmd.main
data/link-identity.json          # 本端稳定身份（gitignore）
data/link-book.json              # 通讯录（gitignore，每台机器自己维护自己的朋友）
```

**坑（已绕开/记录）**：
1. yargs 17 strict 模式下 `cmd <sub> [rest...]` 变参被当 unknown argument 拒绝 → link 走独立 argv 解析器
2. `genkey` 已存在时 RC=0 但输出无地址行（只有 "already exists" 日志）→ 必须先判 existed 再取地址
3. 稳定 key 输出前缀是 `listening with saved key "x":` 不是一次性的 `new address:` → 地址正则不依赖前缀措辞，直接抓 `\btc[20+ chars]` token
4. tc 地址可能被 stdout chunk 截断 → 监听输出用 600 字符滑动窗口累积匹配
5. `tailcat cp` 本地源路径必须是裸文件名（含 `/` 或 `./` 报 invalid DNS name）
