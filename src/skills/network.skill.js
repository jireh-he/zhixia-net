const net = require('../network');
module.exports = {
  name: 'zhixia.network',
  execute(input) {
    if (input.action === 'status') return { peers: (net.peer.list ? net.peer.list().length : 0), dht: (net.dht.list ? net.dht.list().length : 0) };
    if (input.action === 'peers')  return net.peer.list ? net.peer.list() : [];
    if (input.action === 'discover') return net.discovery.find ? net.discovery.find() : [];
    return {};
  }
};
