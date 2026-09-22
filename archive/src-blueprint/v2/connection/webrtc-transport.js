'use strict';

const { PeerConnection } = require('node-datachannel');
const WebSocketClient = require('ws').WebSocket;

module.exports = class WebRTCTransport {
    constructor(opts = {}) {
        this.node = opts.node;
        this.signalingUrl = opts.signalingUrl || '';
        this.iceServers = opts.iceServers || ['stun:stun.l.google.com:19302'];
        this.peers = new Map();
        this.defaultTimeout = opts.timeoutMs || 15000;
    }

    async connect(peer) {
        const existing = this.peers.get(peer.id);
        if (existing && existing.dc && existing.dc.isOpen?.()) {
            return { success: true, strategy: 'webrtc', connection: { id: peer.id, socket: existing.stream, transport: 'webrtc' } };
        }
        if (!this.signalingUrl) {
            return { success: false, reason: 'no signaling url' };
        }
        try { return await this._doConnect(peer); }
        catch (e) { return { success: false, reason: e.message }; }
    }

    /**
     * 处理入站 offer（被动连接：对方先发起，我方响应）
     * 返回：{ peerId, stream, success }
     */
    async acceptOffer(peerId, offerSdp) {
        const existing = this.peers.get(peerId);
        if (existing && existing.dc && existing.dc.isOpen?.()) {
            return { peerId, stream: existing.stream, success: true };
        }
        return this._accept(peerId, offerSdp);
    }

    async _doConnect(peer) {
        const peerId = peer.id;
        const localId = this.node.identity.id;

        const signaling = await this._initSignaling(localId);

        const peerConn = new PeerConnection(localId, { iceServers: this.iceServers });
        const dc = peerConn.createDataChannel('chat');
        const stream = new WebRTCStream(dc, peerId);
        this.peers.set(peerId, { peer, peerConn, dc, signaling, stream });

        // 注册信令回调
        signaling.on('answer', (msg) => {
            if (msg.from === peerId) peerConn.setRemoteDescription(msg.sdp, 'answer');
        });
        signaling.on('ice', (msg) => {
            if (msg.from === peerId) peerConn.addRemoteCandidate(msg.candidate, msg.mid);
        });
        signaling.on('chat', (msg) => {
            if (msg.text && msg.from === peerId) {
                stream._emitData(Buffer.from(
                    JSON.stringify({ type: 'CHAT', from: peerId, data: { text: msg.text } })
                ));
            }
        });

        // 轮询 SDP + ICE gathering
        let offerSent = false;
        let pollInterval = setInterval(() => {
            if (!offerSent) {
                const gs = peerConn.gatheringState && peerConn.gatheringState();
                if (gs === 'complete') {
                    const ld = peerConn.localDescription && peerConn.localDescription();
                    if (ld && ld.sdp) {
                        signaling.send({ type: 'offer', sdp: ld.sdp, to: peerId });
                        offerSent = true;
                        console.log(`[webrtc] ${localId} offer sent (${ld.sdp.length}B)`);
                    }
                }
            }
        }, 50);

        // 等 DataChannel open
        const t0 = Date.now();
        await new Promise((resolve, reject) => {
            let settled = false;
            stream.on('open', () => {
                if (settled) return;
                settled = true;
                clearInterval(pollInterval);
                resolve();
            });
            stream.on('error', (e) => {
                if (settled) return;
                settled = true;
                clearInterval(pollInterval);
                reject(e || new Error('webrtc dc error'));
            });
            setTimeout(() => {
                if (settled) return;
                settled = true;
                clearInterval(pollInterval);
                reject(new Error(`webrtc timeout (${Date.now() - t0}ms)`));
            }, this.defaultTimeout);
        });

        console.log(`[webrtc] connected → ${peerId} (${Date.now() - t0}ms)`);
        return { success: true, strategy: 'webrtc', connection: { id: peerId, socket: stream, transport: 'webrtc' } };
    }

    async _accept(peerId, offerSdp) {
        const localId = this.node.identity.id;
        const signaling = await this._initSignaling(localId);

        const peerConn = new PeerConnection(localId + ':' + peerId, { iceServers: this.iceServers });
        const dc = peerConn.createDataChannel('chat');
        const stream = new WebRTCStream(dc, peerId);
        this.peers.set(peerId, { peer: { id: peerId }, peerConn, dc, signaling, stream });

        signaling.on('ice', (msg) => {
            if (msg.from === peerId) peerConn.addRemoteCandidate(msg.candidate, msg.mid);
        });

        peerConn.setRemoteDescription(offerSdp, 'offer');

        let answerSent = false;
        let pollInterval = setInterval(() => {
            if (!answerSent) {
                const gs = peerConn.gatheringState && peerConn.gatheringState();
                if (gs === 'complete') {
                    const ld = peerConn.localDescription && peerConn.localDescription();
                    if (ld && ld.sdp) {
                        signaling.send({ type: 'answer', sdp: ld.sdp, to: peerId });
                        answerSent = true;
                        console.log(`[webrtc] ${localId} answer sent to ${peerId}`);
                    }
                }
            }
        }, 50);

        await new Promise((resolve, reject) => {
            let settled = false;
            stream.on('open', () => {
                if (settled) return;
                settled = true;
                clearInterval(pollInterval);
                resolve();
            });
            stream.on('error', (e) => {
                if (settled) return;
                settled = true;
                clearInterval(pollInterval);
                reject(e || new Error('webrtc accept error'));
            });
            setTimeout(() => {
                if (settled) return;
                settled = true;
                clearInterval(pollInterval);
                reject(new Error('webrtc accept timeout'));
            }, this.defaultTimeout);
        });

        console.log(`[webrtc] accepted → ${peerId}`);
        return { peerId, stream, success: true };
    }

    async _initSignaling(localId) {
        if (this._signaling && this._signaling.ws && this._signaling.ws.readyState === WebSocketClient.OPEN) {
            return this._signaling;
        }

        const url = new URL(this.signalingUrl);
        url.searchParams.set('peerId', localId);
        const ws = new WebSocketClient(url.toString());

        const handlers = {};
        const signaling = {
            ws,
            localId,
            on(event, handler) {
                if (!handlers[event]) handlers[event] = [];
                handlers[event].push(handler);
                return () => {
                    if (handlers[event]) handlers[event] = handlers[event].filter(h => h !== handler);
                };
            },
            send(msg) {
                if (this.ws.readyState === WebSocketClient.OPEN) {
                    this.ws.send(JSON.stringify(msg));
                } else {
                    console.log(`[signaling] ws not open (${this.ws.readyState})`);
                }
            }
        };

        return new Promise((resolve, reject) => {
            let settled = false;
            ws.once('open', () => {
                if (settled) return;
                settled = true;
                this._signaling = signaling;
                ws.on('message', (data) => {
                    try {
                        const msg = JSON.parse(data.toString());
                        if (handlers[msg.type]) {
                            for (const h of handlers[msg.type]) h(msg);
                        }
                    } catch {}
                });
                // 如果有 _onOffer 回调（被动连接），自动处理
                if (this._onOffer) {
                    const onOffer = (msg) => {
                        if (msg.from && !this.peers.has(msg.from)) {
                            this._onOffer(msg.from, msg.sdp).catch(() => {});
                        }
                    };
                    handlers['offer'] = handlers['offer'] || [];
                    handlers['offer'].push(onOffer);
                }
                resolve(signaling);
            });
            ws.once('error', (e) => {
                if (settled) return;
                settled = true;
                reject(e);
            });
            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                reject(new Error('signaling connect timeout'));
            }, 10000);
            ws.once('close', () => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                reject(new Error('signaling closed'));
            });
        });
    }
}

/**
 * WebRTC Stream 兼容 message.js registerStream()
 */
class WebRTCStream {
    constructor(dc, peerId) {
        this.dc = dc;
        this.peerId = peerId;
        this.readyState = 'connecting';
        this.writable = true;
        this.listeners = {};
        this._bound = false;
        this._bind();
    }

    on(event, fn) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(fn);
        return this;
    }
    off(event, fn) {
        if (this.listeners[event]) this.listeners[event] = this.listeners[event].filter(f => f !== fn);
    }
    removeListener(event, fn) { this.off(event, fn); }

    _bind() {
        if (this._bound) return;
        this._bound = true;

        // 绑定 onMessage（只赋一次，后续不覆盖）
        if (typeof this.dc.onMessage === 'undefined') {
            try { this.dc.onMessage = (data) => {
                const buf = data instanceof Buffer ? data : Buffer.from(data);
                this._emit('data', buf);
            }; } catch {}
        }

        // 轮询 isOpen() 检测连接状态（onOpen/onClosed 是只读 accessor，不能赋值）
        this._pollTimer = setInterval(() => {
            if (this._bound !== true) return;
            const open = this.dc.isOpen && this.dc.isOpen() === true;
            if (open && this.readyState === 'connecting') {
                this.readyState = 'open';
                this.writable = true;
                this._emit('open');
            } else if (!open && this.readyState === 'open') {
                this.readyState = 'closed';
                this.writable = false;
                this._emit('close');
                clearInterval(this._pollTimer);
            }
        }, 50);
        if (this._pollTimer.unref) this._pollTimer.unref();
    }

    _emit(event, data) {
        const l = this.listeners[event];
        if (l) for (const fn of l) fn(data);
    }
    _emitData(buf) { this._emit('data', buf); }

    write(data) {
        if (!this.writable || this.readyState !== 'open') {
            this._emit('error', new Error('stream not writable'));
            return false;
        }
        try {
            this.dc.sendMessageBinary(data instanceof Buffer ? data : Buffer.from(data));
            return true;
        } catch (e) {
            this._emit('error', e);
            return false;
        }
    }

    end() { this.destroy(); }
    destroy(err) {
        try { this.dc.close(); } catch {}
        this.writable = false;
        this.readyState = 'closed';
        if (err) this._emit('error', err);
        this._emit('close');
    }
}
