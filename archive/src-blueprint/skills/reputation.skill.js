const rep = require('../reputation/reputation-manager');
module.exports = {
  name: 'zhixia.reputation',
  execute(input) {
    return rep.local(input.id);
  }
};
