// STUN NAT 类型检测 — 参考 PyPunchP2P stun.py
// RFC 5389 实现，检测公网 IP/端口 + NAT 类型
// NAT 类型: OpenInternet, FullCone, RestrictNAT, RestrictPortNAT, SymmetricNAT, Blocked
const dgram = require('dgram');
const dns = require('dns');

// 使用 IPv4 地址（避免 DNS 返回 IPv6 导致 udp4 socket EINVAL）
const STUN_SERVERS = [
  ['stun.l.google.com', 19302],
  ['stun1.l.google.com', 19302],
  ['stun.cloudflare.com', 3478],
  ['global.stun.twilio.com', 3478],
  ['stun.miwifi.com', 3478]
];

const MAPPED_ADDRESS = 0x0001;
const CHANGE_REQUEST = 0x0003;
const SOURCE_ADDRESS = 0x0004;
const CHANGED_ADDRESS = 0x0005;

const BIND_REQUEST = 0x0001;
const BIND_RESPONSE = 0x0101;

class STUN {
  // 解析 hostname → IPv4（关键：强制 family:4 避免 IPv6 EINVAL）
  _resolve(host) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 3000);
      dns.lookup(host, { family: 4 }, (err, addr) => {
        clearTimeout(timer);
        resolve(err ? null : addr);
      });
    });
  }

  // 生成 96-bit transaction ID（12 字节，RFC 5389）
  _transactionId() {
    const buf = Buffer.alloc(12);
    for (let i = 0; i < 12; i++) buf[i] = Math.floor(Math.random() * 256);
    return buf;
  }

  // 构建 STUN 请求（20 字节 header，RFC 5389）
  _buildRequest(changeRequest) {
    const txnId = this._transactionId();
    const attrBuf = changeRequest ? Buffer.from([
      0x00, 0x03,
      0x00, 0x04,
      0x00, 0x00, 0x00, 0x06
    ]) : Buffer.alloc(0);

    const header = Buffer.alloc(20);
    header.writeUInt16BE(BIND_REQUEST, 0);
    header.writeUInt16BE(attrBuf.length, 2);
    header.writeUInt32BE(0x2112A442, 4);
    txnId.copy(header, 8);

    return Buffer.concat([header, attrBuf]);
  }

  // 解析 STUN 响应
  _parseResponse(buf, expectedTxnId) {
    const msgType = buf.readUInt16BE(0);
    if (msgType !== BIND_RESPONSE) return null;

    const txnId = buf.slice(8, 20).toString('hex');
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

      if (attrType === MAPPED_ADDRESS || attrType === 0x0020) {
        // 0x0001: MAPPED-ADDRESS, 0x0020: XOR-MAPPED-ADDRESS
        const isXor = attrType === 0x0020;
        const port = isXor ? (data.readUInt16BE(2) ^ 0x4442) : data.readUInt16BE(2);
        const ip = this._parseIP(data, isXor);
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

      // 属性填充到 4 字节边界
      offset += 4 + attrLen;
      if (attrLen % 4 !== 0) offset += 4 - (attrLen % 4);
    }
    return result;
  }

  _parseIP(data, xor) {
    if (xor) {
      // XOR-MAPPED-ADDRESS: [family(1)] [port(2)] [ip(4)]
      // IP 从 data[4] 开始，每个字节 XOR magic cookie 0x2112A442 的对应字节
      return [
        data[4] ^ 0x21,
        data[5] ^ 0x12,
        data[6] ^ 0xA4,
        data[7] ^ 0x42
      ].join('.');
    }
    // 普通 MAPPED-ADDRESS
    return [data[4], data[5], data[6], data[7]].join('.');
  }

  // 向已解析的 IPv4 地址发 STUN 请求，等待响应
  _queryIP(sock, ip, port, changeRequest = false, timeout = 3000) {
    const data = this._buildRequest(changeRequest);
    const expectedTxnId = data.slice(8, 20); // 12 字节 txnId，offset 8-19

    return new Promise((resolve) => {
      let resolved = false;
      const onMessage = (buf) => {
        const result = this._parseResponse(buf, expectedTxnId);
        if (result) {
          resolved = true;
          sock.removeListener('message', onMessage);
          resolve(result);
        }
      };
      sock.on('message', onMessage);
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          sock.removeListener('message', onMessage);
          resolve(null);
        }
      }, timeout);
      sock.send(data, port, ip, () => {});
    });
  }

  // 检测 NAT 类型 + 获取公网地址
  async detect(opts = {}) {
    const sourceIP = opts.sourceIP || '0.0.0.0';
    const sourcePort = opts.sourcePort || 0;
    const stunHost = opts.stunHost || null;
    const stunPort = opts.stunPort || null;
    const globalTimeout = opts.timeout || 8000;

    const sock = dgram.createSocket('udp4');
    sock.bind(sourcePort, sourceIP);
    await new Promise(r => sock.on('listening', r));

    // 1. 并发解析所有 STUN 服务器 → IPv4
    const targets = stunHost
      ? [[stunHost, stunPort || 3478]]
      : STUN_SERVERS;

    const resolved = await Promise.all(
      targets.map(([host, port]) => this._resolve(host).then(ip => ip ? { ip, port } : null))
    );
    const validTargets = resolved.filter(Boolean);

    if (validTargets.length === 0) {
      sock.close();
      return { nat: 'Blocked', externalIP: null, externalPort: null };
    }

    // 2. 并发发送请求，谁先回用谁
    let firstResult = null;
    await new Promise((resolve) => {
      let settled = false;
      const pendingTxnIds = [];

      const onMessage = (buf) => {
        if (settled) return;
        for (const txnId of pendingTxnIds) {
          const result = this._parseResponse(buf, txnId);
          if (result) {
            settled = true;
            sock.removeListener('message', onMessage);
            firstResult = result;
            resolve();
            return;
          }
        }
      };
      sock.on('message', onMessage);

      for (const { ip, port } of validTargets) {
        const data = this._buildRequest(false);
        pendingTxnIds.push(data.slice(8, 20));
        sock.send(data, port, ip, () => {});
      }

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          sock.removeListener('message', onMessage);
          resolve();
        }
      }, globalTimeout);
    });

    if (!firstResult || !firstResult.externalIP) {
      sock.close();
      return { nat: 'Blocked', externalIP: null, externalPort: null };
    }

    const extIP = firstResult.externalIP;
    const extPort = firstResult.externalPort;
    const srcIP = firstResult.sourceIP;

    let nat;
    let changedIP = firstResult.changedIP;
    let changedPort = firstResult.changedPort;

    // NAT 类型细分测试
    if (extIP === srcIP || srcIP === '0.0.0.0' || srcIP === '::') {
      const testIP = changedIP || '8.8.8.8';
      const testResp = await this._queryIP(sock, testIP, changedPort || 3478, true).catch(() => null);
      nat = testResp ? 'OpenInternet' : 'SymmetricUDPFirewall';
    } else {
      const testIP = changedIP || '8.8.8.8';
      const testResp = await this._queryIP(sock, testIP, changedPort || 3478, true).catch(() => null);
      if (testResp) {
        nat = 'FullCone';
      } else {
        const testResp2 = await this._queryIP(sock, testIP, changedPort || 3478).catch(() => null);
        if (!testResp2) {
          nat = 'ChangedAddressError';
        } else if (testResp2.externalIP === extIP && testResp2.externalPort === extPort) {
          const testResp3 = await this._queryIP(sock, testIP, 3478).catch(() => null);
          nat = testResp3 ? 'RestrictNAT' : 'RestrictPortNAT';
        } else {
          nat = 'SymmetricNAT';
        }
      }
    }

    sock.close();
    return { nat, externalIP: extIP, externalPort: extPort };
  }
}

module.exports = new STUN();