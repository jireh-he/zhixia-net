// v1.3 — Kademlia DHT 核心（参考 peerchat dhtnode.go + common.go）
// XOR 距离、SHA-1 哈希、K-bucket 路由表、idLookup 分布式查找
// K=20, Alpha=3, IDLen=64

const crypto = require('crypto');

const K = 20;
const Alpha = 3;
const ID_LEN = 64;

// SHA-1 哈希 → 160-bit ID（peerchat 用 uint64 取前 64 位）
function sha1Id(str) {
  const h = crypto.createHash('sha1').update(str).digest();
  // 取前 8 字节作为 64-bit ID
  const buf = Buffer.alloc(8);
  h.copy(buf, 0, 0, 8);
  return '0x' + buf.toString('hex');
}

// XOR 距离
function xor(a, b) {
  // a, b are hex strings like '0xabcdef'
  const aN = BigInt(a);
  const bN = BigInt(b);
  return '0x' + (aN ^ bN).toString(16).padStart(16, '0');
}

// find_n: 找到第一个不同的 bit 位置（bucket 索引）
// 返回 0..ID_LEN-1，越小越近
function findN(a, b) {
  const d = xor(a, b);
  const dN = BigInt(d);
  for (let i = 0; i < ID_LEN; i++) {
    const mask = 1n << BigInt(ID_LEN - 1 - i);
    if (dN & mask) return i;
  }
  return ID_LEN - 1;
}

// 比较距离（越小越近）
function compareDist(a, b) {
  const aN = BigInt(a);
  const bN = BigInt(b);
  if (aN < bN) return -1;
  if (aB > bN) return 1;
  return 0;
}

// 路由表条目
class RoutingEntry {
  constructor(nodeId, ipAddr) {
    this.nodeId = nodeId;
    this.ipAddr = ipAddr;
  }
}

// 路由表条目 + 距离
class RoutingEntryDist {
  constructor(distance, entry) {
    this.distance = distance;
    this.entry = entry;
  }
}

// K-Bucket：每个距离桶最多 K 个节点
// 桶满时 ping 最老的，失败则替换
class KBucket {
  constructor(index, size) {
    this.index = index;
    this.size = size || K;
    this.nodes = []; // [RoutingEntry]，最老在前
  }

  // 添加节点：桶满时 ping 最老，失败替换
  add(entry) {
    // 已存在？移到末尾
    for (let i = 0; i < this.nodes.length; i++) {
      if (this.nodes[i].nodeId === entry.nodeId) {
        this.nodes.splice(i, 1);
        this.nodes.push(entry);
        return true;
      }
    }
    // 桶未满，直接加
    if (this.nodes.length < this.size) {
      this.nodes.push(entry);
      return true;
    }
    // 桶满：尝试 ping 最老的（index 0）
    // 简化：直接替换最老的（实际应异步 ping）
    this.nodes[0] = entry;
    // 移到末尾
    this.nodes.push(this.nodes.shift());
    return true;
  }

  remove(nodeId) {
    this.nodes = this.nodes.filter(n => n.nodeId !== nodeId);
  }

  list() {
    return [...this.nodes];
  }

  get oldest() {
    return this.nodes[0];
  }
}

// 路由表：按距离分桶
class RoutingTable {
  constructor(selfId, buckets) {
    this.selfId = selfId;
    this.buckets = buckets || [];
    for (let i = 0; i < ID_LEN; i++) {
      this.buckets.push(new KBucket(i));
    }
  }

  update(entry) {
    const n = findN(entry.nodeId, this.selfId);
    this.buckets[n].add(entry);
  }

  remove(nodeId) {
    for (const b of this.buckets) b.remove(nodeId);
  }

  // getClosest: 获取距离 targetId 最近的 K 个节点
  getClosest(targetId, count) {
    count = count || K;
    const origIdx = findN(targetId, this.selfId);
    const res = [];

    let bucketIdx = origIdx;
    let increasing = true;

    while (res.length < count) {
      const bucket = this.buckets[bucketIdx];
      if (!bucket || bucket.nodes.length === 0) {
        // 空桶，跳过
      } else {
        for (const entry of bucket.nodes) {
          const dist = xor(entry.nodeId, targetId);
          if (res.length < count) {
            res.push(new RoutingEntryDist(dist, entry));
          } else {
            // 桶满了，排序后替换最远的
            res.sort((a, b) => compareDist(a.distance, b.distance));
            const furthest = res[res.length - 1];
            if (BigInt(dist) < BigInt(furthest.distance)) {
              res[res.length - 1] = new RoutingEntryDist(dist, entry);
            }
          }
        }
      }

      // 桶索引遍历：先递增，到顶后递减
      if (increasing) {
        bucketIdx++;
        if (bucketIdx >= ID_LEN) {
          increasing = false;
          bucketIdx = origIdx > 0 ? origIdx - 1 : -1;
        }
      } else {
        bucketIdx--;
        if (bucketIdx < 0) break;
      }
    }

    res.sort((a, b) => compareDist(a.distance, b.distance));
    return res.slice(0, count);
  }

  list() {
    const out = [];
    for (const b of this.buckets) out.push(...b.list());
    return out;
  }
}

// DHT 节点：路由表 + KV 存储 + 分布式查找
class DHTNode {
  constructor(nodeId, ipAddr) {
    this.nodeId = nodeId;
    this.ipAddr = ipAddr;
    this.routingTable = new RoutingTable(nodeId);
    this.kv = new Map(); // userId → ipAddr
    this.peerCallback = null; // (rpcName, args, reply) => void 异步 RPC 回调
  }

  // 注册一个用户到 DHT
  announceUser(username, ipAddr) {
    const userId = sha1Id(username);
    this.kv.set(userId, ipAddr);

    // 通知最近节点存储该用户
    if (this.peerCallback) {
      const closest = this.routingTable.getClosest(userId, K);
      for (const rd of closest) {
        this.peerCallback('storeUser', {
          queryingNodeId: this.nodeId,
          queryingIpAddr: this.ipAddr,
          announcedUserId: userId,
          announcedIpAddr: ipAddr
        }, { entry: rd.entry });
      }
    }
  }

  // 查找用户 IP
  findUser(username) {
    const userId = sha1Id(username);
    // 本地缓存
    if (this.kv.has(userId)) {
      return this.kv.get(userId);
    }
    // 分布式查找
    return this._idLookup(userId, 'user');
  }

  // 查找最近节点
  findNearestNodes(targetId) {
    return this._idLookup(targetId, 'node');
  }

  // 分布式 idLookup：Alpha 并行查询
  _idLookup(targetId, targetType) {
    const closestNodes = this.routingTable.getClosest(targetId, Alpha);
    if (closestNodes.length === 0) return { nodes: [], ip: null };

    const triedNodes = new Set([this.nodeId]);
    let closest = [...closestNodes];
    closest.push(new RoutingEntryDist(xor(this.nodeId, targetId), new RoutingEntry(this.nodeId, this.ipAddr)));
    closest.sort((a, b) => compareDist(a.distance, b.distance));

    // 异步并行查询
    let found = false;
    let result = { nodes: closest.slice(0, K), ip: null };

    if (!this.peerCallback) return result;

    for (const rd of closest) {
      if (triedNodes.has(rd.entry.nodeId)) continue;
      triedNodes.add(rd.entry.nodeId);

      this.peerCallback('findById', {
        queryingNodeId: this.nodeId,
        queryingIpAddr: this.ipAddr,
        targetId: targetId,
        targetType: targetType
      }, { entry: rd.entry }, (reply) => {
        if (!reply) return;
        // 更新路由表
        this.routingTable.update(new RoutingEntry(reply.queriedNodeId, reply.queriedIpAddr));

        // 如果找到了用户
        if (targetType === 'user' && reply.targetIpAddr) {
          found = true;
          result = { nodes: [], ip: reply.targetIpAddr };
          // 缓存到最近节点
          if (reply.tryNodes && reply.tryNodes.length > 0) {
            const cacheNode = reply.tryNodes[0].entry;
            if (cacheNode && !triedNodes.has(cacheNode.nodeId)) {
              this.peerCallback('storeUser', {
                queryingNodeId: this.nodeId,
                queryingIpAddr: this.ipAddr,
                announcedUserId: targetId,
                announcedIpAddr: reply.targetIpAddr
              }, { entry: cacheNode });
            }
          }
        }

        // 合并结果
        if (reply.tryNodes) {
          for (const tnd of reply.tryNodes) {
            if (!closest.find(c => c.entry.nodeId === tnd.entry.nodeId)) {
              closest.push(tnd);
            }
          }
          closest.sort((a, b) => compareDist(a.distance, b.distance));
          closest = closest.slice(0, K);
          result.nodes = closest;
        }
      });
    }

    return result;
  }

  // Ping 节点
  ping(entry) {
    if (entry.ipAddr === this.ipAddr) return true;
    if (!this.peerCallback) return false;
    return new Promise(resolve => {
      this.peerCallback('ping', {
        queryingNodeId: this.nodeId,
        queryingIpAddr: this.ipAddr
      }, { entry }, (reply) => {
        if (reply && reply.queriedNodeId === entry.nodeId) {
          this.routingTable.update(entry);
          resolve(true);
        } else {
          resolve(false);
        }
      });
    });
  }

  // StoreUser RPC handler
  storeUser(args) {
    this.routingTable.update(new RoutingEntry(args.queryingNodeId, args.queryingIpAddr));
    this.kv.set(args.announcedUserId, args.announcedIpAddr);
  }

  // FindId RPC handler
  findById(args) {
    this.routingTable.update(new RoutingEntry(args.queryingNodeId, args.queryingIpAddr));
    const reply = {
      queriedNodeId: this.nodeId,
      queriedIpAddr: this.ipAddr,
      tryNodes: [],
      targetIpAddr: null
    };

    if (args.targetType === 'user') {
      const userId = args.targetId;
      if (this.kv.has(userId)) {
        reply.targetIpAddr = this.kv.get(userId);
      } else {
        reply.tryNodes = this.routingTable.getClosest(args.targetId, K);
      }
    } else {
      reply.tryNodes = this.routingTable.getClosest(args.targetId, K);
    }

    return reply;
  }

  // Ping RPC handler
  pingHandler(args) {
    this.routingTable.update(new RoutingEntry(args.queryingNodeId, args.queryingIpAddr));
    return { queriedNodeId: this.nodeId };
  }

  // 获取所有已知节点
  listNodes() {
    return this.routingTable.list();
  }

  // 获取所有 KV 映射
  listKV() {
    const out = {};
    for (const [k, v] of this.kv) out[k] = v;
    return out;
  }

  stats() {
    let nodeCount = 0;
    for (const b of this.routingTable.buckets) nodeCount += b.nodes.length;
    return { nodeId: this.nodeId, ipAddr: this.ipAddr, nodes: nodeCount, kvEntries: this.kv.size };
  }
}

module.exports = {
  K, Alpha, ID_LEN,
  sha1Id, xor, findN, compareDist,
  RoutingEntry, RoutingEntryDist,
  KBucket, RoutingTable, DHTNode,

  // ---- 兼容层：提供旧版 singleton API ----
  table: new Map(),
  _instance: null,
  init(selfId, selfIp) {
    this._instance = new DHTNode(sha1Id(selfId), selfIp);
    this.table.set(selfId, { id: selfId, ip: selfIp });
    return this._instance;
  },
  getNode() { return this._instance; },
  put(key, value) { this.table.set(key, value); },
  get(key) { return this.table.get(key); },
  remove(key) { this.table.delete(key); },
  list() { return [...this.table.entries()]; }
};
