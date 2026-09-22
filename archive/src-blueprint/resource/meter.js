// resource/meter — 资源使用事件记录
class ResourceMeter {
  constructor() { this.events = []; }

  record(event) {
    const entry = { ...event, time: Date.now() };
    this.events.push(entry);
    return entry;
  }

  query(provider, type) {
    let q = this.events;
    if (provider) q = q.filter(e => e.provider === provider);
    if (type)     q = q.filter(e => e.resource_type === type);
    return q;
  }

  all() { return this.events; }
}

module.exports = new ResourceMeter();
