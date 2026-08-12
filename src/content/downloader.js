// v0.6.3 Downloader
class Downloader {
  async download(cid, provider) {
    return { cid, provider: provider || 'unspecified', status: 'completed' };
  }
}

module.exports = new Downloader();
