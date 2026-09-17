'use strict';
/**
 * 名片（card）单元测试 — 纯本地，无网络
 * node test/_card.js
 */
const assert = require('assert');
const p2p = require('../src/cli/commands/p2p-cmd');
const { makeCard, parseCard } = p2p;

const ADDR = 'tcGFwWCAzPz1mYCCwvRWaB64ALT9TsQ0vpMDu3MqXjs9qLAB0emFrWCB5zCS3l8EHiCTaHajhEUNpE0SnrSmw70uiR2DbvRcffmFxWCAD3msxS4KDs7qmE1AqOVkRlTToZKX1HuazOfVws3Ih_mFpGQEw';
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + ': ' + e.message); } };

console.log('card 名片单测:\n');

t('makeCard 生成 zcard1. 前缀 token', () => {
  const tok = makeCard('小美', ADDR);
  assert.ok(tok.startsWith('zcard1.'));
  assert.ok(tok.length > 30);
});

t('makeCard → parseCard round-trip', () => {
  const c = parseCard(makeCard('小美', ADDR));
  assert.strictEqual(c.via, '名片');
  assert.strictEqual(c.nick, '小美');
  assert.strictEqual(c.addr, ADDR);
});

t('parseCard 提取自由文本中夹带的名片', () => {
  const msg = '你好，这是我的名片：' + makeCard('阿强', ADDR) + '，请查收！';
  const c = parseCard(msg);
  assert.strictEqual(c.nick, '阿强');
  assert.strictEqual(c.addr, ADDR);
});

t('parseCard 接受裸 tc 地址（via=裸地址，无昵称）', () => {
  const c = parseCard(ADDR);
  assert.strictEqual(c.via, '裸地址');
  assert.strictEqual(c.nick, null);
  assert.strictEqual(c.addr, ADDR);
});

t('parseCard 拒绝非 zcard 垃圾', () => {
  assert.strictEqual(parseCard('hello world'), null);
  assert.strictEqual(parseCard(''), null);
});

t('parseCard 拒绝伪造的 zcard1 token（base64 垃圾）', () => {
  assert.strictEqual(parseCard('zcard1.!!!not-base64!!!'), null);
});

t('parseCard 拒绝 v≠1 的 token（未来版本隔离）', () => {
  const b = Buffer.from(JSON.stringify({ v: 2, nick: 'x', addr: ADDR }), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.strictEqual(parseCard('zcard1.' + b), null);
});

t('parseCard 拒绝 addr 不是 tc 的 token', () => {
  const b = Buffer.from(JSON.stringify({ v: 1, nick: 'x', addr: 'not-tc' }), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.strictEqual(parseCard('zcard1.' + b), null);
});

console.log('\n' + pass + '/' + (pass + fail) + ' PASS' + (fail ? '（有失败！）' : '（全绿）'));
process.exitCode = fail ? 1 : 0;
