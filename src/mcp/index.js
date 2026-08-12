// 必须先加载 skill handlers 才能路由
require('../skill');

module.exports = {
  protocol: require('./protocol'),
  tools: require('./tools'),
  handler: require('./handler'),
  server: require('./server'),
  session: require('./session'),
  auth: require('./auth')
};
