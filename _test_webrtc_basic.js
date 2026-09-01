'use strict';
/**
 * WebRTC DataChannel 最小 e2e 测试
 * 用 node-datachannel 官方 API 风格 (onLocalDescription 自动交换)
 */
const nodeDataChannel = require('node-datachannel');
const { PeerConnection } = nodeDataChannel;

let msgReceivedByB = null;
let dcA = null, dcB = null;

(async () => {
    console.log('=== WebRTC DataChannel e2e (本地直连, STUN only) ===\n');

    const config = {
        iceServers: ['stun:stun.l.google.com:19302'],
    };

    // ── Peer A ──
    const peerA = new PeerConnection('PeerA', config);

    peerA.onLocalDescription((sdp, type) => {
        peerB.setRemoteDescription(sdp, type);
    });
    peerA.onLocalCandidate((candidate, mid) => {
        peerB.addRemoteCandidate(candidate, mid);
    });
    peerA.onDataChannel((dc) => {
        dc.onMessage((msg) => {
            console.log(`[A] RX from B: ${msg}`);
        });
    });

    dcA = peerA.createDataChannel('chat');
    dcA.onOpen(() => {
        console.log(`[A] DataChannel open!`);
        dcA.sendMessage(JSON.stringify({ type: 'CHAT', text: 'hello via WebRTC!', ts: Date.now() }));
    });
    dcA.onMessage((msg) => {
        console.log(`[A] DataChannel msg: ${msg}`);
    });

    // ── Peer B ──
    const peerB = new PeerConnection('PeerB', config);

    peerB.onLocalDescription((sdp, type) => {
        peerA.setRemoteDescription(sdp, type);
    });
    peerB.onLocalCandidate((candidate, mid) => {
        peerA.addRemoteCandidate(candidate, mid);
    });
    peerB.onDataChannel((dc) => {
        dcB = dc;
        console.log(`[B] DataChannel open`);
        dc.onMessage((msg) => {
            console.log(`[B] RX from A: ${msg}`);
            try { msgReceivedByB = JSON.parse(msg); } catch {}
        });
    });

    // 等 ICE 完成 + DataChannel open
    await new Promise(r => setTimeout(r, 4000));

    // 验证
    console.log('\n=== 结果 ===');
    let pass = true;
    const check = (cond, msg, extra = '') => {
        console.log(`  ${cond ? '✓' : '✗'} ${msg}${extra ? ` — ${extra}` : ''}`);
        if (!cond) pass = false;
    };

    check(!!msgReceivedByB, 'B 收到 A 的消息');
    if (msgReceivedByB) {
        check(msgReceivedByB.text === 'hello via WebRTC!', '消息内容正确', msgReceivedByB.text);
    }

    // 打印连接状态
    console.log(`\n[A] state: ${peerA.state}`);
    console.log(`[B] state: ${peerB.state}`);
    console.log(`[A] iceState: ${peerA.iceState}`);
    console.log(`[B] iceState: ${peerB.iceState}`);

    // 清理
    peerA.close();
    peerB.close();

    console.log(`\n=== ${pass ? 'ALL PASSED' : 'SOME FAILED'} ===`);
    process.exit(pass ? 0 : 1);
})().catch(e => {
    console.error('FATAL:', e);
    process.exit(2);
});
