'use strict';
// /api/transit の結合テスト: 既定は経路APIを呼ばず、上限・タイムアウト・障害時は代替案内へ
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fake = require('./fixtures/fakeUpstash.cjs');
fake.install();
const ORIGIN = require('./siteUrl.cjs').DEFAULT_SITE_URL;

async function call(body, { method = 'POST', ip = '203.0.113.5' } = {}) {
  const mod = await import('../api/transit.js');
  const res = fake.mockRes();
  await mod.default({ method, headers: { origin: ORIGIN, 'x-real-ip': ip }, body }, res);
  return res;
}
const body = { from: { lat: 35.69, lon: 139.70 }, to: { lat: 36.57, lon: 139.87 } };

test('既定（未接続）は経路APIを呼ばず not_configured を返す', async () => {
  delete process.env.TRANSIT_PROVIDER;
  const r = await call(body);
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body, { available: false, reason: 'not_configured' });
});

test('入力検証: 出発地・目的地は日本の範囲の座標か文字列', async () => {
  assert.equal((await call({ from: { lat: 0, lon: 0 }, to: body.to })).statusCode, 400);
  assert.equal((await call({ from: { query: '新宿駅' }, to: { query: '' } })).statusCode, 400);
  assert.equal((await call(body, { method: 'GET' })).statusCode, 405);
});

test('接続時: 月間上限 0 なら呼ばない／上限超過は quota／タイムアウト・失敗は代替案内', async () => {
  const mod = await import('../api/transit.js');
  let calls = 0;
  mod.__setProviderForTest('mock', async () => { calls++; return [{ summary: { durationMin: 60 }, legs: [{ mode: 'train', line: '東北線' }] }]; });
  process.env.TRANSIT_PROVIDER = 'mock';
  process.env.TRANSIT_MONTHLY_LIMIT = '0';
  assert.equal((await call(body)).body.reason, 'not_configured');
  assert.equal(calls, 0, '上限0で課金APIを呼んだ');

  process.env.TRANSIT_MONTHLY_LIMIT = '2';
  const ok = await call(body);
  assert.equal(ok.body.available, true);
  assert.equal(ok.body.routes[0].legs[0].line, '東北線');
  await call(body);
  const over = await call(body);
  assert.equal(over.body.reason, 'quota');
  assert.equal(calls, 2);

  fake.reset();
  mod.__setProviderForTest('mock', async ({ signal }) => { const e = new Error('t'); e.name = 'TimeoutError'; void signal; throw e; });
  assert.equal((await call(body)).body.reason, 'timeout');
  mod.__setProviderForTest('mock', async () => []);
  assert.equal((await call(body)).body.reason, 'no_route');
  mod.__setProviderForTest('mock', null);
  delete process.env.TRANSIT_PROVIDER;
});
