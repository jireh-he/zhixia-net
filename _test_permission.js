const mcp = require('./src/mcp');
const pm  = require('./src/permission/manager');
const s   = mcp.session.create({ id: 'agent:001' });
mcp.auth.register(s);
pm.grant({ agent: 'agent:001', permission: 'node.start' });

(async () => {
  // LOW: trust.query — 应该直接执行
  const low = await mcp.server.receive({
    method: 'tools/call',
    params: { name: 'trust.query', arguments: { user: 'zid:test' } }
  }, s);
  console.log('trust.query (LOW):', JSON.stringify(low));

  // MEDIUM: message.send — 应该直接执行（无 approval）
  const med = await mcp.server.receive({
    method: 'tools/call',
    params: { name: 'node.start', arguments: {} }
  }, s);
  console.log('node.start (MEDIUM):', JSON.stringify(med));

  // HIGH: identity.update — 应返回 approval_required
  const high = await mcp.server.receive({
    method: 'tools/call',
    params: { name: 'identity.update', arguments: {} }
  }, s);
  console.log('identity.update (HIGH):', JSON.stringify(high));
})();
