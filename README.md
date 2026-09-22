# zhixia-net（智侠）— 归档仓库

> ⚠️ **本仓库已降级为「P2P 已验证层 + 未验证设计归档」，不再是活跃开发仓。**
>
> 按 2026-09-22 指示，原 zhixia（智侠）与「智侠/其他公司」重名，已另起新仓库 **风语（fengyu）**：
>
> 👉 **活跃仓库：[github.com/jireh-he/fengyu-p2p](https://github.com/jireh-he/fengyu-p2p)**
> 以 tailcat 为唯一底座、给 AI Agent 的 P2P 通讯与文件传输，含可安装 agent skill 包。

**本仓库现在的角色**

| 内容 | 状态 |
|---|---|
| **P2P 已验证层**（tailcat 引擎 + 隐私护栏 + 消息治理） | ✅ 保留在本仓 `bin/zhixia.js` + `src/{tailcat,privacy,cli/commands/p2p-cmd.js}`，可继续用 |
| **未验证设计**（MVP 蓝图 / DHT / 分布式存储 / 信誉·治理·经济·市场 / 三级连接策略 / CF 信令实验） | 📦 **已移入 `archive/` 屏蔽**（见 [archive/README.md](./archive/README.md)），不再维护 |
| **独立演进版** | 🚀 在 `fengyu-p2p` 仓库（P2P 层重构 + agent skill + 文档），本仓此层仅作兼容保留 |

**为什么这样分**

- 「智侠」名字与其他公司撞名 → 换成「风语 / fengyu」。
- 原 zhixia 一揽子蓝图（hyperdht、自建 relay、治理经济市场等）**大多未双机实测验证、且不基于 tailcat**，按主人指示全部归档屏蔽，避免误当作可用功能。
- 只保留**经双机实测**的 tailcat P2P 底座，并独立到 `fengyu-p2p` 作为唯一活跃仓。
- **兼容性**：本仓 `fengyu`/`zhixia` 沿用同一稳定 key 名 `zhixia-default`，已部署机器两边跑的都是同一个稳定地址，通讯录/名片无需重交换。

---

## 本仓 P2P 层怎么用（仍可用，权威版在 fengyu-p2p）

```bash
git clone https://github.com/jireh-he/fengyu-p2p && cd fengyu-p2p   # 建议直接用 fengyu
node scripts/install-tailcat.js
node --no-warnings bin/fengyu.js key      # 稳定身份（tc 地址永久不变）
```

本仓旧的 `zhixia` 入口仍在（P2P-only）：

```bash
cd zhixia-net
node scripts/install-tailcat.js
node --no-warnings bin/zhixia.js key
```

命令集（`zhixia` 与 `fengyu` 一致）：`key / card / book / chat / inbox / files / listen / send / send-file / get / ls / ping / last`。
完整说明、踩坑清单、隐私护栏与消息治理红线见 **fengyu-p2p 仓库的 `README.md` 与 `skill/fengyu-p2p/SKILL.md`**。

## 本仓目录现状

```
zhixia-net/
├── bin/zhixia.js              # P2P-only CLI 入口（兼容保留）
├── scripts/install-tailcat.js # tailcat 静态二进制自动下载
├── src/
│   ├── tailcat/adapter.js     # P2P 引擎封装（实装）
│   ├── privacy/guard.js       # 隐私护栏（实装）
│   └── cli/commands/p2p-cmd.js # P2P 命令层（实装）
├── P2P.md  HANDTEST.md  ONBOARDING.md   # P2P 文档（zhixia 视角）
├── share/                      # P2P files 服务白名单目录
├── test/                       # 名片 / 护栏单测
└── archive/                    # 📦 未验证设计归档区（屏蔽，见 archive/README.md）
```

## 归档屏蔽（`archive/`）

原 `src/` 蓝图模块、MVP CLI 入口（`bin/zhixia-mvp.js`）、`cloudflare-signaling/`、`deployment/`、
蓝图 `package*.json`、旧 `skill/zhixia-p2p/`、蓝图 SQL schema 等，全部移入 `archive/`。
**不维护、不作路线图；需要某模块时从 git 历史或 `archive/` 取回，取回后须先独立验证。**
对照表见 [archive/README.md](./archive/README.md)。

## 双机实测证据（P2P 层，2026-09-17）

| 链路 | 结果 |
|---|---|
| 双身份 `send`（昵称自动匹配） | ✓ 送达对方终端 |
| `send-file` / inbox | ✓ 文件送达（drop box 时间戳后缀） |
| `files` + `ls` + `get` | ✓ 列目录 + 拉取，内容一致 |
| `ping` | ✓ IPv6 直连 1.8ms（NAT 打洞，非 DERP 中继） |
| 稳定身份 | ✓ 同 key 每次起监听打印地址完全一致 |

## License

MIT
