// STUN NAT 类型检测 — 参考 PyPunchP2P stun.py
// RFC 5389 实现，检测公网 IP/端口 + NAT 类型
// NAT 类型: OpenInternet, FullCone, RestrictNAT, RestrictPortNAT, SymmetricNAT, Blocked

const dgram = require('dgram');

const STUN_SERVERS = [
  ['stun.l.google.com', 19302],
  ['stun1.l.google.com', 19302],
  ['stun.voiparound.com', 3478],
  ['stun.voipbuster.com', 3478],
  ['stun.ekiga.net', 3478],
  ['stun.ideasip.com', 3478]
];

const MAPPED_ADDRESS = 0x0001;
const CHANGE_REQUEST = 0x0003;
const SOURCE_ADDRESS = 0x0004;
const CHANGED_ADDRESS = 0x0005;

const BIND_REQUEST = 0x0001;
const BIND_RESPONSE = 0x0101;

class STUN {
  // 生成 128-bit transaction ID
  _transactionId() {
    const buf = Buffer.alloc(16);
    for (let i = 0; i < 16; i++) buf[i] = Math.floor(Math.random() * 256);
    return buf;
  }

  // 构建 STUN 请求
  _buildRequest(changeRequest) {
    const txnId = this._transactionId();
    const attrBuf = changeRequest ? Buffer.from([
      0x00, 0x03, // CHANGE_REQUEST
      0x00, 0x04, // length
      0x00, 0x00, 0x00, 0x06
    ]) : Buffer.alloc(0);

    const header = Buffer.alloc(20);
    header.writeUInt16BE(BIND_REQUEST, 0);
    header.writeUInt16BE(attrBuf.length, 2);
    Buffer.from('2112A442', 'hex').copy(header, 4); // magic cookie
    txnId.copy(header, 8);

    return Buffer.concat([header, attrBuf]);
  }

  // 解析 STUN 响应
  _parseResponse(buf, expectedTxnId) {
    const msgType = buf.readUInt16BE(0);
    if (msgType !== BIND_RESPONSE) return null;

    // 验证 transaction ID
    const txnId = buf.slice(8, 24).toString('hex');
    if (txnId !== expectedTxnId.toString('hex')) return null;

    const result = {
      resp: true,
      externalIP: null, externalPort: null,
      sourceIP: null, sourcePort: null,
      changedIP: null, changedPort: null
    };

    let offset = 20;
    const remaining = buf.readUInt16BE(2);
    const end = offset + remaining;

    while (offset < end && offset + 4 <= buf.length) {
      const attrType = buf.readUInt16BE(offset);
      const attrLen = buf.readUInt16BE(offset + 2);
      const data = buf.slice(offset + 4, offset + 4 + attrLen);

      if (attrType === MAPPED_ADDRESS || attrType === 0x8020) {
        const port = attrType === MAPPED_ADDRESS ?
          data.readUInt16BE(2) : (data.readUInt16BE(2) ^ 0x4442);
        const ip = this._parseIP(data, attrType !== MAPPED_ADDRESS);
        result.externalIP = ip;
        result.externalPort = port;
      } else if (attrType === SOURCE_ADDRESS) {
        const port = data.readUInt16BE(2);
        const ip = this._parseIP(data, false);
        result.sourceIP = ip;
        result.sourcePort = port;
      } else if (attrType === CHANGED_ADDRESS) {
        const port = data.readUInt16BE(2);
        const ip = this._parseIP(data, false);
        result.changedIP = ip;
        result.changedPort = port;
      }

      offset += 4 + attrLen;
    }
    return result;
  }

  _parseIP(data, xor) {
    const m = xor ? 0x4442 : 0;
    const octets = [
      data[4], data[5], data[6], data[7]
    ];
    const port = xor ? (data.readUInt16BE(2) ^ m) : data.readUInt16BE(2);
    return octets.join('.');
  }

  // 发送 STUN 请求并等待响应
  _send(sock, host, port, data, timeout = 3000) {
    return new Promise((resolve) => {
      let settled = false;
      sock.send(data, port, host, (err) => {
        if (err) {
          if (!settled) { settled = true; resolve(null); }
        }
      });
      const timer = setTimeout(() => {
        if (!settled) { settled = true; resolve(null); }
      }, timeout);
      return timer; // caller manages cleanup
    });
  }

  // 核心：向 STUN 服务器发请求，解析响应
  _query(sock, host, port, changeRequest = false) {
    const data = this._buildRequest(changeRequest);
    const expectedTxnId = data.slice(8, 24);

    return new Promise((resolve) => {
      let timer;
      let resolved = false;

      const onMessage = (buf) => {
        const result = this._parseResponse(buf, expectedTxnId);
        if (result) {
          resolved = true;
          if (timer) clearTimeout(timer);
          sock.removeListener('message', onMessage);
          resolve(result);
        }
      };

      sock.on('message', onMessage);
      timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          sock.removeListener('message', onMessage);
          resolve(null);
        }
      }, 3000);

      sock.send(data, port, host);
    });
  }

  // 检测 NAT 类型 + 获取公网地址
  // 返回: { nat, externalIP, externalPort, sourceIP, sourcePort }
  async detect(opts = {}) {
    const sourceIP = opts.sourceIP || '0.0.0.0';
    const sourcePort = opts.sourcePort || 0;
    const stunHost = opts.stunHost || null;
    const stunPort = opts.stunPort || null;

    const sock = dgram.createSocket('udp4');
    sock.bind(sourcePort, sourceIP);
    await new Promise(r => sock.on('binding', r));

    // 尝试连接 STUN 服务器
    let result = null;
    if (stunHost) {
      result = await this._query(sock, stunHost, stunPort || 3478);
    } else {
      for (const [host, port] of STUN_SERVERS) {
        result = await this._query(sock, host, port);
        if (result) break;
      }
    }

    if (!result || !result.externalIP) {
      sock.close();
      return { nat: 'Blocked', externalIP: null, externalPort: null };
    }

    const extIP = result.externalIP;
    const extPort = result.externalPort;
    const srcIP = result.sourceIP;

    let nat;
    let changedIP = result.changedIP;
    let changedPort = result.changedPort;

    // Test 1: 本地地址 == 公网地址 → 直连或对称防火墙
    if (extIP === srcIP || srcIP === '0.0.0.0' || srcIP === '::') {
      // 用 change request 测试
      const changedAddr = changedIP || '8.8.8.8';
      const testResp = await this._query(sock, changedAddr, changedPort || 3478, true);
      if (testResp) {
        nat = 'OpenInternet';
      } else {
        nat = 'SymmetricUDPFirewall';
      }
    } else {
      // Test 2: 用 change request 发请求
      const testResp = await this._query(sock, changedIP || '8.8.8.8', changedPort || 3478, true);
      if (testResp) {
        nat = 'FullCone';
      } else {
        // Test 3: 直接向 changed address 发请求（无 change request）
        const testResp2 = await this._query(sock, changedIP || '8.8.8.8', changedPort || 3478);
        if (!testResp2) {
          nat = 'ChangedAddressError';
        } else {
          // 检查映射是否变化
          if (testResp2.externalIP === extIP && testResp2.externalPort === extPort) {
            // Test 4: change port only
            const data = this._buildRequest(true);
            const testResp3 = await this._query(sock, changedIP || '8.8.8.8', 3478);
            if (testResp3) {
              nat = 'RestrictNAT';
            } else {
              nat = 'RestrictPortNAT';
            }
          } else {
            nat = 'SymmetricNAT';
          }
        }
      }
    }

    sock.close();
    return { nat, externalIP: extIP, externalPort: extPort };
  }
}

module.exports = new STUN();
