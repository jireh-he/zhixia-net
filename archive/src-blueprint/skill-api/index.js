// Phase 26 — Skill API 冻结（v1.0 Beta 兼容接口）
module.exports = {
  version: '1.0 Beta',
  identity: {
    get: (opts) => {
      const localStore = require('../storage/local-store');
      return localStore.load('identity');
    }
  },
  network: {
    peers: () => {
      const net = require('../network');
      return net.peer.list ? net.peer.list() : [];
    }
  },
  message: {
    send: (opts) => {
      const comm = require('../communication/manager');
      return comm.create(opts);
    }
  },
  storage: {
    put: (data, opts = {}) => {
      const mgr = require('../storage/storage-manager');
      return mgr.store(data, opts);
    },
    get: (cid) => {
      const mgr = require('../storage/storage-manager');
      return mgr.get(cid);
    }
  },
  reputation: {
    get: (id) => {
      const rep = require('../reputation/reputation-manager');
      return rep.local(id || 'local');
    }
  }
};
