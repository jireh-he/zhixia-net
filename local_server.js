// Local zhixia-net node server (mirrors ato server)
const t = require('./src/network/transport');
const fs = require('fs');

const id = JSON.parse(fs.readFileSync('./data/node-config.json', 'utf8')) || { id: 'zid:local' };

t.listen(9001, (s) => {
  s.write(JSON.stringify({ type: 'hello', from: 'local', id: id.id }) + '\n');
  s.on('data', (d) => {
    const raw = d.toString().trim();
    process.stdout.write('LOCAL GOT: ' + raw + '\n');
    fs.appendFileSync('./data/local_msgs.txt', 'GOT: ' + raw + '\n');
    s.write(JSON.stringify({ type: 'ack', from: 'local', data: raw }) + '\n');
  });
  s.on('error', () => {});
});

process.stdout.write('LOCAL LISTENING 9001 id=' + id.id + '\n');
