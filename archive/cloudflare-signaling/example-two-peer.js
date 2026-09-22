/**
 * 端到端示例: 两个节点通过 Cloudflare Workers 信令建立 WebRTC 连接
 *
 * 运行:
 *   # 1. 部署 Worker 到 Cloudflare
 *   cd cloudflare-signaling && npx wrangler deploy
 *
 *   # 2. 设置环境变量
 *   export SIGNALING_URL="wss://zhixia-webrtc-signaling.<你的子域>.workers.dev"
 *
 *   # 3. 跑示例
 *   node cloudflare-signaling/example-two-peer.js
 *
 * 输出:
 *   A: [signaling] connected
 *   A: 向 B 发 offer
 *   B: 收到 offer, 生成 answer
 *   B: 向 A 发 answer
 *   A: 收到 answer, ICE 协商中...
 *   A/B: DataChannel open
 *   A: 发送消息给 B
 *   B: 收到消息
 */

const ZhixiaSignalingClient = require('./client.js');
const { PeerConnection } = require('node-datachannel');

async function main() {
    const url = process.env.SIGNALING_URL || 'wss://example.workers.dev';
    console.log(`=== Zhixia WebRTC e2e via ${url} ===\n`);

    // ── Peer A ──
    const peerIdA = 'zid:example-a-' + Math.random().toString(36).slice(2, 6);
    const signalingA = new ZhixiaSignalingClient(url, peerIdA, { reconnectDelay: 5000 });
    await signalingA.connect();
    signalingA.startHeartbeat();

    let dcA = null;
    const peerA = new PeerConnection(peerIdA, {
        iceServers: ['stun:stun.l.google.com:19302'],
    });

    peerA.onLocalDescription((sdp, type) => {
        // 发到对端 (假设对端是 peerIdB)
        // 在实际场景里, 通过 signaling.send({type:'offer', sdp, to: peerIdB})
    });
    peerA.onLocalCandidate((candidate, mid) => {
        // 发到对端
        // signalingA.send({ type: 'ice', candidate, mid, to: peerIdB });
    });
    peerA.onDataChannel((dc) => {
        dc.onMessage((msg) => {
            console.log(`[A] RX from B: ${msg}`);
        });
    });

    // ── Peer B ──
    const peerIdB = 'zid:example-b-' + Math.random().toString(36).slice(2, 6);
    const signalingB = new ZhixiaSignalingClient(url, peerIdB, { reconnectDelay: 5000 });
    await signalingB.connect();
    signalingB.startHeartbeat();

    const peerB = new PeerConnection(peerIdB, {
        iceServers: ['stun:stun.l.google.com:19302'],
    });

    peerB.onDataChannel((dc) => {
        dc.onMessage((msg) => {
            console.log(`[B] RX from A: ${msg}`);
        });
    });

    // ── 信令消息处理 ──
    // A 处理来自 B 的消息
    signalingA.on('answer', (msg) => {
        console.log(`[A] 收到 B 的 answer`);
        peerA.setRemoteDescription(msg.sdp, 'answer');
    });
    signalingA.on('ice', (msg) => {
        peerA.addRemoteCandidate(msg.candidate, msg.mid);
    });

    // B 处理来自 A 的消息
    signalingB.on('offer', (msg) => {
        console.log(`[B] 收到 A 的 offer`);
        peerB.setRemoteDescription(msg.sdp, 'offer').then(() => {
            const answer = peerB.createAnswer();
            signalingB.send({ type: 'answer', sdp: answer.sdp, to: msg.from });
        });
    });
    signalingB.on('ice', (msg) => {
        peerB.addRemoteCandidate(msg.candidate, msg.mid);
    });

    // B 的本地 SDP / ICE 发回给 A
    peerB.onLocalDescription((sdp, type) => {
        // answer 已经在 offer handler 里发了
    });
    peerB.onLocalCandidate((candidate, mid) => {
        // 找到最近的 offer from
        // signalingB.send({ type: 'ice', candidate, mid, to: lastOfferFrom });
    });

    // ── 发起连接 ──
    console.log(`[A] 创建 DataChannel, 生成 offer...`);
    dcA = peerA.createDataChannel('chat');
    dcA.onOpen(() => {
        console.log(`[A] DataChannel open! 发送测试消息...`);
        dcA.sendMessage(JSON.stringify({ type: 'CHAT', text: 'hello from A via Cloudflare signaling!', ts: Date.now() }));
    });
    dcA.onMessage((msg) => {
        console.log(`[A] DataChannel msg: ${msg}`);
    });

    // 把 A 的本地 SDP/ICE 推到 B
    peerA.onLocalDescription((sdp, type) => {
        if (type === 'offer') {
            signalingA.send({ type: 'offer', sdp, to: peerIdB });
        }
    });
    peerA.onLocalCandidate((candidate, mid) => {
        signalingA.send({ type: 'ice', candidate, mid, to: peerIdB });
    });

    // 等连接建立
    await new Promise(r => setTimeout(r, 5000));

    // 清理
    signalingA.disconnect();
    signalingB.disconnect();
    peerA.close();
    peerB.close();

    console.log(`\n=== 完成 ===`);
    process.exit(0);
}

main().catch(e => {
    console.error('FATAL:', e);
    process.exit(1);
});
