# 智侠网 · v0.3 数据模型设计
# Zhixia Net — Data Model Design

> **来源**：v0.3 阶段与外部设计建议对照后整理的最终方案
> **状态**：规划中（待实现）
> **原则**：身份不可改、资料可变、声誉靠证据不靠评分、Topic 是第一公民

---

## 一、核心域划分

```
Identity (身份) → Content (内容) → Message (通讯) → Trust (信任)
```

四个域，以 Topic（江湖）贯穿始终。

---

## 二、采纳清单

### ✅ 采纳：Identity / Profile 分离

**身份** — 永不变，由密钥对定义：

```sql
CREATE TABLE identities (
    id TEXT PRIMARY KEY,          -- 格式: zid:xxxx
    public_key TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    status TEXT DEFAULT 'active'  -- 'active' | 'revoked'
);
```

**资料** — 可变，由用户维护：

```sql
CREATE TABLE profiles (
    user_id TEXT PRIMARY KEY,
    username TEXT,
    avatar TEXT,
    description TEXT,
    tags TEXT,         -- JSON 数组
    updated_at INTEGER,
    FOREIGN KEY(user_id) REFERENCES identities(id)
);
```

**关系**：identity 是锚点，profile 是外壳。改名、换头像不影响 zid。

### ✅ 采纳：外置密钥 + export/import

```
~/.zhixia/users/
└── zid:xxxx/
    ├── identity.json    -- { id, publicKey, created }
    ├── private.key      -- AES-256 加密，密码来自 keytar
    └── profile.json     -- profile 的本地缓存
```

CLI 命令：

```bash
zhixia user create          # 生成密钥对 + 写入 identity 表
zhixia user info            # 显示 zid + profile
zhixia user export          # 加密导出 .backup 文件
zhixia user import <file>   # 恢复身份到本机
```

### ✅ 采纳：Content 模型（新增）

当前代码库**完全没有内容层**，这是核心 Gap。

```sql
CREATE TABLE contents (
    id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,            -- zid
    hash TEXT UNIQUE,               -- SHA256 内容哈希
    type TEXT NOT NULL,             -- 'article' | 'image' | 'video' | 'document' | 'dataset'
    title TEXT,
    metadata TEXT,                  -- JSON
    created_at INTEGER,
    FOREIGN KEY(owner) REFERENCES identities(id)
);

CREATE TABLE content_versions (
    id TEXT PRIMARY KEY,
    content_id TEXT NOT NULL,
    parent_version TEXT,            -- 上一版，形成 Git 式版本树
    hash TEXT,
    created_at INTEGER,
    FOREIGN KEY(content_id) REFERENCES contents(id)
);
```

**版本树不可删除历史**：类似 Git commit，任何修改都是新版本，旧版本永远可追溯。

### ✅ 采纳：CLI 分组

```
zhixia user create | info | export | import
zhixia profile set | show
zhixia message send <zid> <text> | history
zhixia content publish <file> | share <cid>
zhixia trust show <zid> | evidence <zid>
```

---

## 三、修正清单

### ⚠️ 修正：`trust_scores` 表 → 实时计算，不存表

ChatGPT 建议：

```sql
CREATE TABLE trust_scores (
    user_id TEXT PRIMARY KEY,
    content_score REAL, total REAL, ...
);
```

**拒绝**。原因是：把计算结果存表 = 把快照当事实。声誉是动态的，应该每次从 `attestations` 实时计算（带衰减）。

当前 `reputation.js` 的 `computeVerifiedReputation()` 已经是这个方向，正确。

> 如果需要性能优化，可以在 `reputation` 表加 `computed_at` 和 `score_cache` 字段，但**明确标注为缓存**，逻辑层必须优先查 attestation。

### ⚠️ 修正：`propagation` 表 → 用当前 DAG，不用简单链

ChatGPT 的 design：`from_user → to_user → action` 的线性链，太粗。

我们的 `propagation.js` 已经实现了**签名验证的传播 DAG**：
- Origin 奖励 + Relay 奖励分层
- 防环（同 pubkey 不重复入链）
- 7 天去重
- 跳数加权（`originRewardBase × hop_count × multiplier`）

保留现有实现，`propagation_rewards` 表已就绪。

### ⚠️ 补充：`topics` 表

ChatGPT 的设计完全遗漏了 Topic（江湖），这是智侠网最核心的概念。

所有 `reputation` / `attestation` / `propagation` 都绑定 topic。需要一张 topics 表记录：

```sql
CREATE TABLE topics (
    topic_id TEXT PRIMARY KEY,          -- topic hex
    name TEXT,                          -- 江湖名
    joined_at INTEGER,
    peers_count INTEGER DEFAULT 0,
    local_rules TEXT,                   -- 本地策略 JSON
    created_at INTEGER
);
```

---

## 四、废弃清单

### ❌ 废弃：`conversations` 表

```sql
CREATE TABLE conversations (id, type, created_at);
CREATE TABLE conversation_members (conversation_id, user_id);
```

**原因**：智侠网当前是 **P2P 点对点广播网络**，不是传统聊天应用。消息沿 Topic + 兴趣图谱传播，没有"会话"概念。

硬加 conversations 会约束架构，限制未来的多跳路由。**等真的需要群组功能时再加**。

### ❌ 废弃：`presence` 人工填写

不设计用户手填"在线/离线"。在线状态从 Daemon 心跳和 DHT 响应时间自动推导。

---

## 五、最终数据关系图

```
                    Topics (江湖)
                         │
            ┌────────────┼────────────┐
            │            │            │
        Identity      Content     Attestations
        (zid)         (contents)  (evidence)
            │            │            │
        Profile    Propagation     Reputation
        (可变)     (DAG, 奖励)    (实时计算)
            │            │            │
            └────────────┼────────────┘
                         │
                   Messages
                (点对点/广播)
```

---

## 六、实施路线图

| 阶段 | 内容 | 依赖 |
|------|------|------|
| **v0.3.1** | identity/profile 分离 + 密钥外置 + topics 表 + migration 系统 | 改造 database.js |
| **v0.3.2** | content + content_versions 表 + publish/share 命令 | v0.3.1 |
| **v0.3.3** | 实时声誉计算（从 attestation 聚合）+ trust CLI | v0.3.1 |
| **v0.3.4** | message history + 会话管理（可选） | v0.3.2 |

---

## 七、v0.3.1 实施设计

### 7.1 目标

把"Node/Agent 身份"升级为"用户身份系统"，完成 5 个 CLI 命令：

```
zhixia user create    # 生成密钥对 + 注册身份
zhixia user info      # 显示当前用户信息
zhixia user export    # 加密导出身份
zhixia user import    # 从备份恢复身份
zhixia profile set    # 修改用户名等资料
```

### 7.2 目录结构

```
src/
├── cli/
│   ├── index.js
│   ├── commands/        # 按域拆分
│   │   ├── user.js
│   │   ├── profile.js
│   │   └── message.js   # 原有逻辑迁移
│   └── index.js
├── daemon/              # 不动
├── engine/
│   ├── attestation.js
│   ├── propagation.js
│   ├── reputation.js
│   └── database.js      # 整合到 storage/
├── identity/
│   ├── index.js          # 统一入口
│   ├── manager.js        # 身份业务逻辑
│   ├── keystore.js       # 密钥生成/加密/存储
│   ├── profile.js        # 资料管理
│   └── migrate.js        # 从 agent_cards 迁移
├── storage/
│   ├── database.js       # 统一 DB 入口
│   ├── migration.js      # migration 系统
│   └── schema/
│       └── 001_identity.sql
├── core/
│   └── command-bus.js    # 命令路由
└── sanitizer/            # 不动
```

### 7.3 Identity 核心

```
zid 生成规则: zid:${SHA256(publicKey).slice(0, 8)}
```

**身份不变**：改名/换头像/重置密钥都不影响 zid（密钥变则 zid 变 = 新用户，旧身份吊销）

**目录结构**：

```
~/.zhixia/users/zid:xxxx/
├── identity.json    -- { id, publicKey, createdAt }
├── private.key      -- argon2+AES-256-GCM 加密
└── profile.json     -- { username, avatar, description, tags, updatedAt }
```

### 7.4 密钥加密方案

**首选（有依赖）**：`argon2` npm 包 + `aes-256-gcm`

**备选（无额外依赖）**：`crypto.pbkdf2` + `crypto.createCipheriv('aes-256-gcm')`

> 建议用**备选方案**，零额外依赖，Node 原生支持。PBKDF2 200000 迭代 + 128-bit salt 足够安全。

加密结构：

```json
{
  "encrypted": true,
  "algorithm": "aes-256-gcm",
  "kdf": "pbkdf2",
  "iterations": 200000,
  "salt": "<hex>",
  "iv": "<hex>",
  "data": "<hex>"
}
```

### 7.5 Migration 系统

```sql
-- schema/001_identity.sql
CREATE TABLE IF NOT EXISTS identities (
    id TEXT PRIMARY KEY,
    public_key TEXT UNIQUE NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS profiles (
    user_id TEXT PRIMARY KEY,
    username TEXT,
    avatar TEXT,
    description TEXT,
    tags TEXT,              -- JSON 数组
    updated_at INTEGER,
    FOREIGN KEY(user_id) REFERENCES identities(id)
);

CREATE TABLE IF NOT EXISTS topics (
    topic_id TEXT PRIMARY KEY,
    name TEXT,
    joined_at INTEGER,
    peers_count INTEGER DEFAULT 0,
    local_rules TEXT,
    created_at INTEGER
);
```

`migration.js` 负责：
- 读取当前 DB schema 版本（`integrity_check` 表扩展或新增 `schema_version` 表）
- 按版本号顺序执行 SQL
- 幂等（重复执行不报错）

### 7.6 Command Bus 设计

```
CLI → CommandBus → IdentityManager → Keystore → SQLite
```

不异步瀑布。Bus 是同步命令路由器，handler 直接执行，不返回 Promise wrapper。

**为什么保留 Bus 而不是直接调 manager**：为未来 AI 调用预留入口——Agent 可以通过 `bus.execute({action: 'user.create'})` 执行命令，无需写 CLI 解析逻辑。

### 7.7 现有代码兼容

| 当前 | 迁移策略 |
|------|----------|
| `agent_cards` 表 | **保留双写**，新身份写入 identities + profiles，老代码查询 agent_cards 仍然工作 |
| `keytar` 存储密钥 | 新身份用外置加密文件，旧逻辑保留 keytar 兼容 |
| `database.js` 硬编码建表 | 迁移到 `storage/database.js`，原文件作为薄 wrapper 保留兼容 |
| `commands.js` 扁平命令 | 拆到 `commands/user.js` 等，原文件做导出兼容 |

**兼容期**：v0.3.1 完成后的 1 个版本内，agent_cards 和 keytar 路径双写，v0.4 再清理。

### 7.8 验收标准

```bash
$ zhixia user create
# → ~/.zhixia/users/zid:xxxx/{identity.json, private.key, profile.json}

$ zhixia user info
# → ID / Public Key / Username / Created

$ zhixia profile set username="智侠用户"
# → profile.json 更新

$ zhixia user export > backup.zip
$ rm -rf ~/.zhixia/users/zid:xxxx/
$ zhixia user import < backup.zip
# → 恢复成功
```

---

## 八、与当前代码对照

| 设计目标 | 当前状态 | 行动 |
|----------|----------|------|
| identities | `agent_cards` 混合了身份+资料 | v0.3.1 拆表 |
| profiles | 无独立表 | v0.3.1 新增 |
| key export/import | 无 | v0.3.1 新增 CLI |
| contents | 无 | v0.3.2 新增 |
| content_versions | 无 | v0.3.2 新增 |
| topics | 无独立表 | v0.3.1 新增 |
| propagation DAG | ✅ 已实现 | 保持 |
| attestations | ✅ 已实现 | 保持 |
| trust 实时计算 | ✅ 方向正确 | v0.3.3 完善 |
| migration 系统 | 无 | v0.3.1 新增 |