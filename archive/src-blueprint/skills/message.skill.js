const comm = require('../communication/manager');
module.exports = {
  name: 'zhixia.message',
  async execute(input) {
    return comm.create({ from: input.from, to: input.to, type: 'text', payload: { text: input.text } });
  }
};
