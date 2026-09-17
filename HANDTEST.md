# zhixia P2P 手工测试流程（双机：hyl 本机 ↔ ato）

> 环境基线（2026-09-17 已清理确认）：
> - hyl 本机：zhixia/tailcat 进程 0 个；通讯录已清空；身份 zhixia-default 保留；tailcat 二进制就位
> - ato：9000/9001 已停、P2P 监听已清、inbox/日志已清；身份 key（~/.config/tailcat/keys/）保留
> - 全部命令前缀：`cd /home/hyl/zhixia-net &&`（ato 侧为 `cd /home/coder/project/zhixia-net && /home/coder/apps/node-v22.14.0-linux-x64/bin/node`）
> - hyl 本机 node 直接 `node --no-warnings bin/zhixia.js`

## 命令约定
- 【H】= hyl 本机终端执行
- 【A】= ato 上执行（你已 SSH 进 ato 就直接跑；不方便就把「帮我跑 A-Tx」发给我，我用 paramiko 代执行并把输出贴回）
- 每步都有「预期结果」，对照判断通过与否

---

### T1 生成/查看双方稳定身份
【H】`node --no-warnings bin/zhixia.js key`
【A】`node --no-warnings bin/zhixia.js key`
预期：各打印一段 `稳定地址: tc...`（各约 100+ 字符，永不变）。
**记下：H 地址 = AH，A 地址 = AA**（下面要用）

### T2 互相存通讯录
【H】`node --no-warnings bin/zhixia.js book add ato AA`
【A】`node --no-warnings bin/zhixia.js book add hyl AH`
验证：`book`（或 `book list`）各显示 1 人
预期：`✓ 已添加`

### T3 连通性
【H】`node --no-warnings bin/zhixia.js ping ato`
预期：`✓ 可达`（可看是直连还是 DERP 中继，直连延迟通常 <10ms）

### T4 三合一接收服务（ato 后台只挂 1 个进程：chat + inbox + files）
【A】后台起**唯一一个**接收服务：
`nohup node --no-warnings bin/zhixia.js listen --files-dir /home/coder/hand-servedir > /tmp/hand-listen.log 2>&1 &`
（`--only chat,files` 可按需只开子集；`--rw` 放开 files 写权限）
验证：`tail /tmp/hand-listen.log` 出现 `[chat]`/`[inbox]`/`[files]` 三段就绪 + 稳定地址
此时 H 侧无需再开任何后台进程，下面 T5–T7 全打这一个目标。

### T5 聊天消息（打 T4 的 chat 路）
【H】`node --no-warnings bin/zhixia.js send ato "手工测试 T5 成功"`
【A】`tail -5 /tmp/hand-listen.log`
预期：日志 `[chat]` 段里出现该消息文本。

### T6 发文件（打 T4 的 inbox 路）
【H】`echo "hand-test-$(date +%s)" > /tmp/handfile.txt && node --no-warnings bin/zhixia.js send-file /tmp/handfile.txt ato`
【A】`ls <listen 的 --inbox-dir 或默认 ./zhixia-inbox>`
预期：出现 `handfile.txt.<时间戳>.<hash>` 形式文件（drop box 同名自动加后缀），内容与本机一致。

### T7 文件服务 + 拉取（打 T4 的 files 路）
【A】`mkdir -p /home/coder/hand-servedir && echo served-content > /home/coder/hand-servedir/hello.txt`（在 T4 起服务前先备好，或起服务后补放也行——SFTP 实时读目录）
【H】`node --no-warnings bin/zhixia.js ls ato /home/coder/hand-servedir`
【H】`node --no-warnings bin/zhixia.js get ato /home/coder/hand-servedir/hello.txt`
预期：ls 列出 `hello.txt`；get 后本机当前目录出现 hello.txt，内容 = served-content。

### T8 隐私护栏（可选，推荐跑）
【H】造两个假敏感文件（别用真凭据）：
```
printf -- '-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n' > /tmp/fake.key
printf 'DB_PASSWORD=fakepw\n' > /tmp/fake.env
node --no-warnings bin/zhixia.js send-file /tmp/fake.key /tmp/fake.env ato
```
预期：`⛔` 拦截提示（列出命中原因：密钥材料/口令字段），**文件根本没发出**（ato inbox 不会多文件）。
对照：正常文件仍放行（T5 已证）。
`--force` 仅在知情确认后使用；智能体代跑时绝不自动加。

### T9 收尾（全按 PID 杀，勿 pkill -f 全串）
【H】`ps aux | grep -E 'zhixia|tailcat' | grep -v grep` → 逐项 kill
【A】`kill $(cat /tmp/hand-listen.pid 2>/dev/null)`（listen 是单父进程，杀它三路全停；已补起杂散 tailcat 子进程的另按 PID 杀）
验证：两侧 `ps` 均 0 个；`/home/coder/hand-*` 测试目录自行清理。

---

## 易错点（来自实测）
1. **chat/inbox/files 是监听端**：发送方向不需要任何进程；接收方对应进程不在线就超时——这是设计（无离线队列），不是故障。
2. **按 PID 杀监听**：`pkill -f "zhixia.js chat"` 会因自匹配把当前 shell 链一起杀（exit -15 假死），用 `ps|grep -v grep|awk '{print $2}'|xargs kill`。
3. **ato 到 GitHub 不通**：二进制已就位勿重装；重装走「本地传二进制 + chmod +x」。
4. **get/ls 需要对方开着 files**（不是 inbox）；send-file 需要对方开着 inbox（不是 files）。
5. 护栏拦截发生在**连接建立之前**，被拦的敏感文件 0 字节外发。
