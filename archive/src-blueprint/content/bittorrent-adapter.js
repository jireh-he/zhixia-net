// v0.6.3 BitTorrent 适配接口
class BitTorrentAdapter {
  publish(cid) { return { protocol: 'bittorrent', cid }; }
  fetch(cid)   { return { protocol: 'bittorrent', cid, status: 'pending' }; }
}

module.exports = new BitTorrentAdapter();
