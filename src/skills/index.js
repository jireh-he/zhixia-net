module.exports = {
  manifest: require('./manifest.json'),
  runtime: require('./runtime'),
  identity: require('./identity.skill'),
  message: require('./message.skill'),
  storage: require('./storage.skill'),
  reputation: require('./reputation.skill'),
  market: require('./market.skill'),
  network: require('./network.skill')
};
