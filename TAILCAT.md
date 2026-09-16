# tailcat 引擎 — P2P 聊天 & 文件传输（第四传输层）

[Tailcat](https://github.com/tailscale/tailcat)（Tailscale 官方开源，7.3k★）= Tailscale 数据面
（magicsock）的无控制平面版本：

- **WireGuard 端到端加密**，无账号、无路由表改动
- 公共免费 **DERP 中继** 做 bootstrap 信令 + 自动 NAT 打洞升级 **UDP 直连**
- 与 zhixia 三级策略（IPv6 Direct / NAT Hole Punch / Tor）互补：
  DERP 是「公共免费基础设施」，符合「不建自建 relay」铁律
- 官方静态二进制，**ato（CentOS 7 / glibc 2.17 / Node 16）可直接运行**

## 安装

```bash
cd /home/hyl/zhixia-net
node --no-warnings scripts/install-tailcat.js
# 输出: bin/tailcat/tailcat-linux-amd64 (静态链接, 18MB)
```

脚本特性：官方 GitHub release + 4 个国内镜像 fallback、断点续传（curl -C - 循环）、
sha256 校验（校验和取自 release 的 checksums.txt，拿不到则跳过）。
也可 `export ZHIXIA_TAILCAT=/path/to/tailcat` 显式指定。

## 用法（全部实测通过）

```bash
# ── 聊天（一次性消息，类似 netcat over Tailscale）──
$ zhixia tailcat server                      # 监听端：打印 tc 地址，连上后双向打字
# 🐈 Server listening with new address: tcpGFwWCDq2I...
$ zhixia tailcat send <tc地址> "hello"       # 发送端（对方 server 终端会显示）

# ── 文件传输 ──
$ zhixia tailcat recv [dir]                  # 收件箱（write-only drop box，默认 ./zhixia-inbox）
$ zhixia tailcat send-file <文件...> <tc地址> [-r]   # 发文件到收件箱（-r 目录递归）
$ zhixia tailcat serve-files [dir] [--rw]    # 文件服务（SFTP，默认只读）
$ zhixia tailcat get <tc地址> <远端文件> [本地路径]   # 拉文件
$ zhixia tailcat ls <tc地址> [路径]           # 列目录（SFTP 原生，对端无需装 OpenSSH）

# ── 辅助 ──
$ zhixia tailcat ping <tc地址>               # 连通测试（每次 pong 报 DERP 中继 or 直连）
$ zhixia tailcat last                        # 显示本端最近记住的 tc 地址（data/tailcat.last-addr.json）
```

**地址交换方式**：tc 地址 = 一次性端点（含 WireGuard 公钥 + 区域信息），
跨机器时直接通过任意渠道（微信/IM/扫码）传字符串即可，无需账号。
服务端每次启动生成新地址（`zhixia tailcat last` 可查本端最近地址）。

## 实测证据（2026-09-16）

| 链路 | 结果 |
|---|---|
| server + send 回环 | ✓ 消息 `hello from zhixia wrapper test 123` 送达 |
| recv + send-file | ✓ 文件送达（drop box 加时间戳后缀防冲突） |
| serve-files + ls + get | ✓ 列目录 + 拉取成功，内容一致 |
| ping | ✓ 可达（本机走 DERP(tokyo) 中继；跨网 NAT 打洞后自动转直连） |

## 代码结构

```
bin/tailcat/tailcat-linux-amd64   # 引擎二进制（gitignore，install-tailcat.js 下载）
scripts/install-tailcat.js        # 自动下载（镜像 fallback + 续传 + sha256）
src/tailcat/adapter.js            # 引擎适配层：spawn 封装 + tc 地址解析 + 超时/错误处理
src/cli/commands/tailcat-cmd.js   # CLI 子命令 + 独立 argv 解析器（不走 yargs）
bin/zhixia.js                     # 顶部拦截 process.argv[2]==='tailcat' → tailcat-cmd.main
```

**yargs 坑（已绕开）**：yargs 17 strict 模式下 `cmd <sub> [rest...]` 的变参值会被
当 unknown argument 拒绝（实测复现），故 tailcat 子命令走独立解析器，Node 16 零依赖。

**drop box 行为**：`recv` 收件箱是 write-only、扁平的——同名文件自动加
`.<timestamp>.<hash>` 后缀，不能列目录/读回（要列目录用 `serve-files`）。
