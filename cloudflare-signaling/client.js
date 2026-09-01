/**
 * Zhixia WebRTC Signaling Client (Node.js)
 *
 * 用法:
 *   const client = new ZhixiaSignalingClient('wss://<worker-url>', 'zid:xxxx');
 *   await client.connect();
 *
 *   // 找对端
 *   client.on('peer-joined', (peerId) => { ... });
 *   client.on('offer', async (msg) => {
 *       // msg.from, msg.sdp
 *       const answer = await myPeer.createAnswer();
 *       client.send({ type: 'answer', sdp: answer.sdp, to: msg.from });
 *   });
 *
 *   // 主动发起
 *   const offer = await myDataChannel.createOffer();
 *   client.send({ type: 'offer', sdp: offer.sdp, to: 'zid:yyy' });
 *
 *   // ICE 交换
 *   myPeer.onLocalCandidate((candidate, mid) => {
 *       client.send({ type: 'ice', candidate, mid, to: 'zid:yyy' });
 *   });
 *   client.on('ice', (msg) => {
 *       myPeer.addRemoteCandidate(msg.candidate, msg.mid);
 *   });
 *
 *   // 发消息
 *   client.send({ type: 'chat', text: 'hello', to: 'zid:yyy' });
 *   client.on('chat', (msg) => { ... });
 */

const WebSocket = require('ws');

class ZhixiaSignalingClient {
    constructor(url, peerId, opts = {}) {
        this.url = url;
        this.peerId = peerId;
        this.opts = opts;
        this.ws = null;
        this.connected = false;
        this.reconnectTimer = null;
        this.messageHandlers = {};

        this.on('message', (msg) => {
            // 默认处理: pong 心跳
            if (msg.type === 'pong') {
                this.lastPongTime = Date.now();
                return;
            }
        });
    }

    connect() {
        return new Promise((resolve, reject) => {
            const url = new URL(this.url);
            url.searchParams.set('peerId', this.peerId);

            this.ws = new WebSocket(url.toString());

            this.ws.on('open', () => {
                this.connected = true;
                console.log(`[signaling] connected as ${this.peerId}`);
                resolve();
            });

            this.ws.on('message', (data) => {
                let msg;
                try { msg = JSON.parse(data.toString()); } catch (e) { return; }
                this.emit('message', msg);
                if (this.messageHandlers[msg.type]) {
                    for (const h of this.messageHandlers[msg.type]) h(msg);
                }
            });

            this.ws.on('close', (code, reason) => {
                this.connected = false;
                console.log(`[signaling] disconnected: ${code} ${reason}`);
                this.emit('disconnect', { code, reason });
                this.scheduleReconnect();
            });

            this.ws.on('error', (err) => {
                console.error(`[signaling] error: ${err.message}`);
                reject(err);
            });
        });
    }

    disconnect() {
        this.send({ type: 'leave' });
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.opts.disableReconnect = true;
        if (this.ws) {
            this.ws.close(1000, 'client disconnect');
            this.ws = null;
        }
        this.connected = false;
    }

    send(msg) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error('not connected');
        }
        this.ws.send(JSON.stringify(msg));
    }

    scheduleReconnect() {
        if (this.opts.disableReconnect) return;
        const delay = this.opts.reconnectDelay || 3000;
        this.reconnectTimer = setTimeout(() => {
            console.log('[signaling] reconnecting...');
            this.connect().catch(() => {});
        }, delay);
    }

    on(event, handler) {
        if (!this.messageHandlers[event]) this.messageHandlers[event] = [];
        this.messageHandlers[event].push(handler);
    }

    off(event, handler) {
        if (!this.messageHandlers[event]) return;
        this.messageHandlers[event] = this.messageHandlers[event].filter(h => h !== handler);
    }

    emit(event, data) {
        // 兼容 ws 事件 (message, close, error)
        if (event === 'message') {
            // already emitted above
            return;
        }
        if (this.messageHandlers[event]) {
            for (const h of this.messageHandlers[event]) h(data);
        }
    }
}

// 心跳
ZhixiaSignalingClient.prototype.startHeartbeat = function (intervalMs = 30000) {
    if (this._heartbeatTimer) clearInterval(this._heartbeatTimer);
    this._heartbeatTimer = setInterval(() => {
        if (!this.connected) return;
        // 如果太久没 pong, 重连
        if (this.lastPongTime && Date.now() - this.lastPongTime > intervalMs * 2) {
            console.log('[signaling] heartbeat timeout, reconnecting');
            this.ws.close(4000, 'heartbeat timeout');
            return;
        }
        this.send({ type: 'ping', ts: Date.now() });
    }, intervalMs);
};

module.exports = ZhixiaSignalingClient;
