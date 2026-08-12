module.exports = {
  weight: require('./identity-weight'),
  trustGraph: require('./trust-graph'),
  sybil: require('./sybil-detector'),
  abuse: require('./abuse-monitor'),
  manager: require('./security-manager')
};
