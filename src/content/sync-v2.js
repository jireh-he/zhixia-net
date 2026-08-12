// v0.6.3 Content Sync — 同步请求/响应
class ContentSync {
  request(cid) { return { type: 'content.request', cid, time: Date.now() }; }
  receive(cid) { return { type: 'content.sync',    cid, time: Date.now() }; }
}

module.exports = new ContentSync();
