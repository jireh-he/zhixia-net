const EventEmitter = require('events');
const handler = require('./handler');
const permissionManager = require('../permission/manager');
const riskManager = require('../permission/risk');
const approvalManager = require('../permission/approval');
const auditLog = require('../permission/audit');

class MCPServer extends EventEmitter {
  async receive(request, session) {
    try {
      if (request.method === 'tools/call' && session) {
        const action  = request.params.name;
        const risk    = riskManager.level(action);
        const agentId = (session.agent && session.agent.id) || session.id;

        // LOW 自动放行；MEDIUM 检查权限；HIGH 走审批
        if (risk === 'HIGH') {
          const req = approvalManager.create(agentId, action);
          return { status: 'approval_required', approval_id: req.id };
        }

        if (risk === 'MEDIUM') {
          const allowed = permissionManager.check(agentId, action);
          if (!allowed) return { success: false, error: 'permission denied' };
        }
      }

      if (session) auditLog.record({ agent: session.id, action: request.method, session: session.id });

      const result = await handler.handle(request);
      return { success: true, result };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
}

module.exports = new MCPServer();
