const identity = require('../identity');
module.exports = {
  name: 'zhixia.identity',
  execute(input) { return identity.manager.info(); }
};
