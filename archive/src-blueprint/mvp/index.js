// Phase 23 — MVP Minimal Architecture: 7 核心能力清单
module.exports = {
  version: '1.0 MVP',
  name: 'zhixia-net',
  core: {
    identity: { desc: '去中心化身份', ready: true },
    p2pNetwork: { desc: 'P2P 网络层', ready: true },
    peerDiscovery: { desc: '节点发现', ready: true },
    message: { desc: '点对点消息', ready: true },
    distributedStorage: { desc: '分布式存储', ready: true },
    reputation: { desc: '信誉系统', ready: true },
    agentSkill: { desc: 'Agent Skill', ready: true }
  },
  deferred: {
    governance: { desc: '治理层', phase: '21' },
    economics: { desc: '经济激励', phase: '21' },
    marketplace: { desc: '资源市场', phase: '21' },
    tor: { desc: 'Tor 隐私层', phase: '21' },
    sybilComplex: { desc: '复杂 Sybil 算法', phase: '21' }
  },
  mvpTestFlow: [
    'A 启动',
    'B 启动',
    'A 自动发现 B',
    'A 发送消息给 B',
    'A 发布内容，B 通过 CID 获取',
    'Agent 通过 Skill 完成上述操作'
  ],
  cliCommands: ['init', 'online', 'status', 'peers', 'send', 'publish', 'get', 'skills', 'skill'],
  agentAPI: ['zhixia.identity', 'zhixia.send', 'zhixia.publish', 'zhixia.get', 'zhixia.search', 'zhixia.reputation']
};
