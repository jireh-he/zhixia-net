// risk — 操作风险等级
class RiskManager {
  level(action) {
    switch (action) {
      case 'identity.update':    return 'HIGH';
      case 'content.publish':    return 'MEDIUM';
      case 'message.send':       return 'MEDIUM';
      case 'trust.query':        return 'LOW';
      case 'resource.query':     return 'LOW';
      case 'resource.usage':     return 'LOW';
      case 'resource.contribution': return 'LOW';
      case 'agent.find':         return 'LOW';
      case 'agent.reputation':   return 'LOW';
      case 'node.status':        return 'LOW';
      case 'node.start':         return 'MEDIUM';
      case 'node.stop':          return 'MEDIUM';
      default:                   return 'HIGH';
    }
  }
}

module.exports = new RiskManager();
