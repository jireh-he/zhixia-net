// Durable Object: 每个 peer 一个实例
// 负责：维护 WebSocket 连接、转发 SDP/ICE 消息、持久化对端列表
//
// 状态模型：
//   - 本 DO 实例对应一个 peer (peerId 由 DO 名决定)
//   - peer 通过 WS 连接进来后，把它的"想通信的对端 peerId 列表"写到 state
//   - 收到 offer/answer/ice 消息时，按 to 字段找目标 DO，转发过去
//
// 为什么一个 peer 一个 DO (而不是一个会话一个 DO)：
//   - peer 可以主动找 N 个对端通信，需要维护多个对端状态
//   - WebSocket 是连接级别的，一个 peer 一个 DO 更好管理其连接池

export class SignalingDO {
    constructor(state, env) {
        this.state = state;
        this.env = env;
        this.ws = null;             // 当前 WebSocket 连接 (单连接模型)
        this.peerId = null;         // 当前连接者的 peerId
        this.pendingSessions = new Set();  // 待应答的 peer 列表
        this.stats = {
            joins: 0,
            messages: 0,
            lastActive: 0,
        };
    }

    async fetch(request, props) {
        const peerIdHeader = props?.headers?.get('X-Peer-Id');

        // 如果是 WebSocket 升级请求
        if (request.headers.get('Upgrade') === 'websocket') {
            // 一个 peer 同时只允许一个 WS 连接 (新连接会覆盖旧的)
            if (this.ws) {
                try { this.ws.close(1000, 'replaced by new connection'); } catch {}
            }

            const pair = new WebSocketPair();
            const [client, server] = Object.values(pair);
            this.ws = server;
            this.peerId = peerIdHeader;
            this.stats.joins++;
            this.stats.lastActive = Date.now();

            // 初始化状态
            await this.state.storage.set('stats', this.stats);
            await this.state.storage.set('lastActive', this.stats.lastActive);

            // 发送 join 确认
            this.sendMessage({
                type: 'joined',
                peerId: this.peerId,
                peers: [],  // 先空，peer 可以发 query 请求当前在线 peer
                serverTime: Date.now(),
            });

            // 事件处理
            this.ws.accept();
            this.ws.addEventListener('message', (event) => {
                this.handleMessage(event.data);
            });
            this.ws.addEventListener('close', (event) => {
                this.handleClose(event.code, event.reason);
            });
            this.ws.addEventListener('error', (event) => {
                console.error(`[DO:${this.peerId}] ws error: ${event.type}`);
            });

            return new Response(null, { status: 101, webSocket: client });
        }

        // HTTP 健康检查
        if (request.method === 'GET') {
            return Response.json({
                ok: true,
                peerId: this.peerId,
                stats: this.stats,
                hasConnection: !!this.ws,
                pendingSessions: [...this.pendingSessions],
            });
        }

        return new Response('method not allowed', { status: 405 });
    }

    async handleMessage(raw) {
        this.stats.lastActive = Date.now();
        this.stats.messages++;
        await this.state.storage.set('stats', this.stats);

        let msg;
        try {
            msg = JSON.parse(raw.toString ? raw.toString() : raw);
        } catch (e) {
            this.sendMessage({ type: 'error', message: 'invalid json' });
            return;
        }

        switch (msg.type) {
            case 'ping':
                this.sendMessage({ type: 'pong', ts: msg.ts });
                break;

            case 'query-peers':
                // 查询当前网络里知道的 peer 列表 (简化版：只返本 DO 的 pending)
                this.sendMessage({
                    type: 'peer-list',
                    peers: [...this.pendingSessions],
                });
                break;

            case 'offer':
            case 'answer':
            case 'ice':
            case 'chat':
                if (!msg.to) {
                    this.sendMessage({ type: 'error', message: 'missing to' });
                    return;
                }
                await this.forwardTo(msg.to, msg);
                break;

            case 'leave':
                this.sendMessage({ type: 'left' });
                // 通知 pending 的对端
                for (const peerId of this.pendingSessions) {
                    await this.forwardTo(peerId, {
                        type: 'peer-left',
                        peerId: this.peerId,
                    });
                }
                this.pendingSessions.clear();
                break;

            default:
                this.sendMessage({ type: 'error', message: `unknown type: ${msg.type}` });
        }
    }

    /**
     * 把消息转发给目标 peer 的 DO
     */
    async forwardTo(targetPeerId, msg) {
        if (!this.env || !this.env.SIGNALING_DO) {
            this.sendMessage({ type: 'error', message: 'env not available' });
            return;
        }

        const doId = this.env.SIGNALING_DO.idFromName(targetPeerId);
        const doStub = this.env.SIGNALING_DO.get(doId);

        // 把消息打包成 HTTP POST 请求发给目标 DO
        const response = await doStub.fetch(new Request(
            'https://signaling.internal/forward',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-From-Peer': this.peerId,
                },
                body: JSON.stringify(msg),
            }
        ));

        if (!response.ok) {
            this.sendMessage({
                type: 'error',
                message: `forward to ${targetPeerId} failed: HTTP ${response.status}`,
                to: targetPeerId,
            });
            return;
        }

        // 记录 pending
        this.pendingSessions.add(targetPeerId);
    }

    /**
     * 处理从其他 DO 转发的消息
     * 在 fetch() 里处理 POST 请求时会调这里
     */
    async handleForwarded(fromPeerId, msg) {
        // 把消息推给本 DO 的 WS 客户端
        this.sendMessage({
            ...msg,
            from: fromPeerId,
        });
        // 更新 pending
        this.pendingSessions.add(fromPeerId);
    }

    sendMessage(obj) {
        if (!this.ws || this.ws.readyState !== 1) {
            return;
        }
        try {
            this.ws.send(JSON.stringify(obj));
        } catch (e) {
            console.error(`[DO:${this.peerId}] send failed: ${e.message}`);
        }
    }

    handleClose(code, reason) {
        console.log(`[DO:${this.peerId}] ws closed: code=${code} reason=${reason}`);
        this.ws = null;
        // 通知 pending 的对端
        for (const peerId of this.pendingSessions) {
            this.forwardTo(peerId, {
                type: 'peer-left',
                peerId: this.peerId,
                reason: 'connection lost',
            });
        }
        this.pendingSessions.clear();
    }
}

// 需要把 fetch() 里的 POST /forward 转发到 handleForwarded
// 这里加一个包装 (通过 state.storage 传 fromPeerId)
SignalingDO.prototype._patchedFetch = null;

// 通过静态方法扩展：拦截 POST /forward
const originalFetch = SignalingDO.prototype.fetch;
SignalingDO.prototype.fetch = async function (request, props) {
    // 拦截 POST /forward
    if (request.method === 'POST' && request.url.includes('/forward')) {
        try {
            const fromPeerId = request.headers.get('X-From-Peer');
            const msg = await request.json();
            await this.handleForwarded(fromPeerId, msg);
            return Response.json({ ok: true });
        } catch (e) {
            return new Response('forward error: ' + e.message, { status: 500 });
        }
    }
    return originalFetch.call(this, request, props);
};
