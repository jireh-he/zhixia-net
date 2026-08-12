// resource/usage — 用量聚合
class UsageAggregator {
  all(provider) {
    const meter = require('./meter');
    return meter.query(provider);
  }

  byType(events) {
    const agg = { compute: 0, storage: 0, relay: 0, bandwidth: 0, online: 0 };
    for (const e of events) {
      if (agg[e.resource_type] !== undefined) agg[e.resource_type] += e.amount;
    }
    return agg;
  }
}

module.exports = new UsageAggregator();
