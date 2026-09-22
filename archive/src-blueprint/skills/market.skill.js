const mk = require('../market');
module.exports = {
  name: 'zhixia.market',
  execute(input) {
    if (input.action === 'search') {
      const list = mk.matcher.list(input.type);
      return Array.isArray(list) ? list : [];
    }
    if (input.action === 'find') {
      const o = new mk.Order({ requester: input.requester, type: input.type, amount: input.amount });
      const providers = mk.matcher.match(o);
      return { order: o, providers: Array.isArray(providers) ? providers : [] };
    }
    return null;
  }
};
