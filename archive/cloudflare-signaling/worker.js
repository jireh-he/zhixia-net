// Cloudflare Worker 入口
// 路由：HTTP → 返回服务信息；WebSocket → 升级连接到 Durable Object

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const isWebSocket = request.headers.get('Upgrade') === 'websocket';

        if (isWebSocket) {
            // 从 query 拿 peerId (节点身份)
            const peerId = url.searchParams.get('peerId') || 'anon-' + Math.random().toString(36).slice(2, 10);

            // 每个 peer 一个 Durable Object 实例 (session id = peerId)
            // 这样每个节点有独立的 WebSocket 连接池，DO 内维护该 peer 的 session 状态
            const doId = env.SIGNALING_DO.idFromName(peerId);
            const doStub = env.SIGNALING_DO.get(doId);

            // 把 WebSocket 升级请求代理到 DO
            const response = await doStub.fetch(request, {
                headers: {
                    'X-Peer-Id': peerId,
                },
            });
            return response;
        }

        // HTTP 请求：返回服务信息
        if (url.pathname === '/' || url.pathname === '/health') {
            return Response.json({
                ok: true,
                service: 'zhixia-webrtc-signaling',
                version: '1.0.0',
                wsEndpoint: 'wss://' + url.host + '/ws',
                protocol: {
                    join: '{type:join, peerId}',
                    offer: '{type:offer, sdp, to}',
                    answer: '{type:answer, sdp, to}',
                    ice: '{type:ice, candidate, mid, to}',
                    leave: '{type:leave}',
                },
            });
        }

        return new Response('Not found', { status: 404 });
    },
};
