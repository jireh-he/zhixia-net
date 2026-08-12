const r = require('./src/resource');

r.meter.record({ type: 'compute', provider: 'agent:B', consumer: 'agent:A', amount: 10, resource_type: 'compute' });
r.meter.record({ type: 'relay',   provider: 'agent:B', consumer: 'agent:A', amount: 50,  resource_type: 'relay' });
r.meter.record({ type: 'storage', provider: 'agent:B', consumer: 'agent:A', amount: 20,  resource_type: 'storage' });

const events = r.meter.query('agent:B');
console.log('meter events:', events.length);
console.log('contribution score:', r.contribution.calculate(events));
console.log('usage by type:', JSON.stringify(r.usage.byType(events)));

r.quota.set('agent:B', 'relay', 100);
console.log('quota relay consume 30:', JSON.stringify(r.quota.consume('agent:B', 'relay', 30)));
console.log('quota relay consume 80:', JSON.stringify(r.quota.consume('agent:B', 'relay', 80)));

console.log('policy allow message.send:', r.policy.allow('message.send'));
console.log('policy allow unlimited_compute:', r.policy.allow('unlimited_compute'));
