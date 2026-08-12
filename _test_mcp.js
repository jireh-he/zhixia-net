const mcp = require('./src/mcp');
const s = mcp.session.create({ id: 'agent:test001' });
mcp.auth.register(s);

(async () => {
  try {
    const r = await mcp.server.receive({ method: 'tools/list' }, s);
    console.log('tools count:', r.result.tools.length);
    const c = await mcp.server.receive({
      method: 'tools/call',
      params: { name: 'node.status', arguments: {} }
    }, s);
    console.log('call:', JSON.stringify(c).slice(0, 200));
  } catch (e) {
    console.log('ERR:', e.message, '\n', e.stack.split('\n').slice(0, 8).join('\n'));
  }
})();
