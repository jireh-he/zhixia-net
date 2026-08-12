const node = require('./src/node');
(async () => {
  console.log('status before:', JSON.stringify(node.node.statusInfo()));
  await node.node.start();
  console.log('status after start:', JSON.stringify(node.node.statusInfo()));
  node.scheduler.add('heartbeat', 10000, () => console.log('hb scheduled'));
  console.log('scheduler jobs:', node.scheduler.jobs.length);
  console.log('heartbeat:', JSON.stringify(node.heartbeat.send('node:001')));
  console.log('monitor ok:', !!node.monitor.collect().memory);
  node.maintenance.addTask('cleanup', () => 'cleaned');
  const res = await node.maintenance.run();
  console.log('maintenance:', JSON.stringify(res));
  console.log('full status keys:', Object.keys(node.status.full()));
})();
