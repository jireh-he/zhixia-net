// identity.get — 返回本地身份概要
const registry = require('../registry');
const identity = require('../../identity');

registry.register('identity.get', async () => {
  try {
    const info = await identity.manager.info();
    return { ok: true, identity: info };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
