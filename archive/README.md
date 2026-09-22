# archive/ — 未验证设计归档（屏蔽区）

> 本目录下的内容来自原 zhixia（智侠）的 MVP/蓝图设计，**均未通过双机实测验证**，
> 且大多不是基于 tailcat 传输层的设计（hyperdht / 三级连接策略 / 自建 relay 等）。
> 按 2026-09-22 主人指示归档屏蔽，**不再是活跃设计，不维护、不作为路线图**。
> 需要捡回某个模块时从 git 历史或本目录取，取回后必须先独立验证。

## 原则

- **唯一保留的传输底座 = tailcat**（P2P 层，已双机实测）。tailcat 之上的新能力逐步验证后再合入。
- 原 zhixia 的非 tailcat 设计（DHT 发现、分布式存储、信誉/治理/经济/市场、三级连接策略、
  Cloudflare 信令实验等）一律进本目录，不再作为活跃设计维护。
- 已验证的 P2P 能力已独立到 **`github.com/jireh-he/fengyu`（风语）**，含 agent skill 包。

## 目录对照

| 路径 | 内容 | 备注 |
|---|---|---|
| `src-blueprint/` | 原 `src/` 下全部蓝图模块（agent-network / consensus / governance / economics / market / network(DHT) / storage / content / trust / reputation / security / mcp / mvp / skills / skill / daemon / engine / sanitizer / sdk / protocol / v2 / permission / communication / identity / core） | 蓝图代码，未验证 |
| `src-blueprint/cli-commands-*.js` | 原 MVP CLI 命令（status/online/peers/publish/reputation/…） | 已由 P2P-only 入口取代 |
| `docs/` | ARCHITECTURE / DESIGN_PLAN / SECURITY | 蓝图设计文档 |
| `bin-zhixia-mvp.js` | 原全量 CLI 入口（MVP+P2P） | P2P 入口现为 `bin/zhixia.js` |
| `bin-data/`、`bin-nohup.out` | 运行时产物/日志 | 误入 git 的垃圾 |
| `cloudflare-signaling/` | CF worker 信令实验 | 未验证 |
| `config/`、`data-mvp/` | MVP 配置与运行时状态 | P2P 用 `data/p2p-*.json`（gitignored，未归档） |
| `storage/` | 蓝图 SQL schema（017–036） | 未验证 |
| `deployment/` | docker 部署蓝图 | 未验证 |
| `manifest/` | package*.json（MVP 依赖） | P2P 零 npm，不需要 |
| `skill-zhixia-p2p/` | 旧 skill 包（指向 zhixia） | 已被 `fengyu` 仓库取代 |
| `test-v12-integration.js` | MVP 集成测试 | 依赖 MVP |

## 仍在活动面的（非归档）

- `bin/zhixia.js` + `src/cli/commands/p2p-cmd.js` + `src/tailcat/adapter.js` + `src/privacy/guard.js`
  — P2P 已验证层（注意：此四件套的独立演进版在 fengyu 仓库）
- `P2P.md` / `ONBOARDING.md` / `README.md` / `share/` / `test/_card.js` / `test/_privacy_guard.js`
