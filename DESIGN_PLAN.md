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

## 七、与当前代码对照

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