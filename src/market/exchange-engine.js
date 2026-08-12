// Phase 19 — Exchange Engine
const matcher = require('./matcher');
const eco = require('../economics');

class ExchangeEngine {
  execute(order, resources) {
    const providers = matcher.match(order, resources);
    if (!providers.length) return null;
    const provider = providers[0];
    order.status = 'matched';
    order.provider = provider.id;
    const cost = provider.price * order.amount;
    try {
      eco.balance.subtract(order.requester, cost);
      eco.balance.add(provider.owner, cost);
    } catch (e) {
      order.status = 'failed';
      return { order, reason: e.message };
    }
    // 记录贡献
    const contrib = new eco.Contribution({ node: provider.owner, type: provider.type, value: order.amount });
    eco.engine.process(contrib);
    return { order, provider, cost };
  }
}

module.exports = new ExchangeEngine();
