# zhixia-net 部署指南

## 架构

```text
                Bootstrap Node
                     |
        +------------+------------+
        |                         |
    Node A                    Node B
   (Normal)                 (Storage)
        |                         |
    Agent SDK              Relay Node
```

## 组件

| 组件 | 功能 |
|---|---|
| `zhixia-node` | 节点服务（normal/storage/relay 三种模式） |
| `zhixia-bootstrap` | 发现入口（新节点询问） |
| `zhixia-relay` | NAT 中继（穿透私有网络） |
| `zhixia-agent-sdk` | AI Agent 调用接口 |
| `zhixia-cli` | 管理工具 |

## 本地 Docker 测试网

```bash
# 5 节点测试网（1 bootstrap + 4 角色节点）
cd deployment/docker
docker compose up -d

# 查看状态
docker compose ps

# 进入某个节点
docker compose exec node1 zhixia status
```

## VPS 部署

```bash
# 1. 安装
curl -fsSL https://install.zhixia.net | bash

# 2. 初始化
zhixia init

# 3. 上线（三种角色）
zhixia online              # 普通节点
zhixia online --storage    # 存储节点
zhixia online --relay      # Relay 节点
zhixia online --mode bootstrap  # Bootstrap 节点

# 4. 监控
zhixia status
zhixia peers
zhixia monitor
```

## VPS 角色分配

| VPS | 角色 | 端口 | 说明 |
|---|---|---|---|
| VPS-1 | Bootstrap | 9000 | 新节点发现入口 |
| VPS-2 | Relay | 9001 | NAT 穿透中继 |
| VPS-3 | Storage | 9002 | 分布式存储 |

## 测试网规模

| 阶段 | 节点数 | 目标 |
|---|---|---|
| 1 | 5 | 基本连通 |
| 2 | 50 | 性能基线 |
| 3 | 500 | 压力测试 |

## 测试指标

| 项目 | 目标 |
|---|---|
| 节点发现 | < 5s |
| 消息延迟 | < 500ms |
| 文件恢复 | 多节点成功 |
| 信誉同步 | 正常 |
| Agent 调用 | 成功 |

## 完整链路

```
AI Agent → zhixia-agent-sdk → Skill Runtime
    → zhixia Network → P2P Nodes
    → Storage / Reputation / Marketplace
    → Distributed Information Network
```

## 配置文件

```
config/default.json              # 默认节点配置
deployment/config/bootstrap.json # Bootstrap 节点
deployment/config/network.json   # 网络发现配置
```
