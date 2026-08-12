// resource/policy — 资源策略
class ResourcePolicy {
  allow(action) {
    const blocked = ['unlimited_compute', 'anonymous_relay'];
    return !blocked.includes(action);
  }
}

module.exports = new ResourcePolicy();
