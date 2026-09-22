const store = require('../storage/local-store');
module.exports = {
  name: 'zhixia.storage',
  async execute(input) {
    if (input.action === 'save') return store.save(input.key, input.data);
    if (input.action === 'get')  return store.load(input.key);
    return null;
  }
};
