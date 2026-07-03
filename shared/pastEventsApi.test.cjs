'use strict';
// /api/admin/past-events ハンドラの統合確認（401/no-store/OPTIONS/400/200）。
// fetch をスタブして events.json と Upstash 応答を供給し、ネットワーク非依存・高速にする。
const { test } = require('node:test');
const assert = require('node:assert');
const S = require('./session.cjs');

process.env.KV_REST_API_URL = process.env.KV_REST_API_URL || 'https://example.invalid';
process.env.KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN || 'x';
// ヘッダ認証（移行期・既定ON）で national_admin を用意（パスワードは scrypt）
process.env.ADMIN_ACCOUNTS_B64 = Buffer.from(JSON.stringify([
  { user: 'nat', pass: S.hashPassword('pw'), pref: '*', displayId: 'OP-N' },
])).toString('base64');

// 昨日/今日（JST）
const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const yest = new Date(Date.parse(today + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
const SCRAPE = { tokyo: [
  { id: 'p1', pref: 'tokyo', date: yest, title: '過去テスト', place: 'Y' },
  { id: 'f1', pref: 'tokyo', date: today, title: '本日テスト' },
], updatedAt: today };

// 恒久アーカイブ（events.json から7日超で外れた過去イベント）
const ARCHIVE = { updatedAt: today, events: [
  { id: 'arch1', pref: 'tokyo', office: '', date: '2026-01-10', title: 'アーカイブ過去テスト', place: 'Z', source_type: 'scrape', archivedAt: today },
] };

// fetch スタブ: events.json はSCRAPE、archive はARCHIVE、Upstash は空(result:null)
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes('/data/events.json')) return { ok: true, status: 200, json: async () => SCRAPE };
  if (u.includes('/data/events-archive.json')) return { ok: true, status: 200, json: async () => ARCHIVE };
  return { ok: true, status: 200, json: async () => ({ result: null }), text: async () => '{"result":null}' };
};

function mockRes() {
  const r = { statusCode: 200, headers: {}, body: null };
  r.setHeader = (k, v) => { r.headers[String(k).toLowerCase()] = v; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = () => r;
  return r;
}
async function call(method, headers = {}, query = {}) {
  const handler = (await import('../api/admin/past-events.js')).default;
  const res = mockRes();
  await handler({ method, headers, query }, res);
  return res;
}
const AUTH = { 'x-admin-user': 'nat', 'x-admin-pass': 'pw', origin: 'https://jsdf-chiiki-events.vercel.app' };

test('未認証は401＋no-store', async () => {
  const res = await call('GET', {});
  assert.equal(res.statusCode, 401);
  assert.equal(res.headers['cache-control'], 'no-store, private');
  assert.equal(res.headers['pragma'], 'no-cache');
  assert.equal(res.headers['expires'], '0');
});
test('OPTIONS は204', async () => {
  const res = await call('OPTIONS', {});
  assert.equal(res.statusCode, 204);
});
test('認証あり: 過去イベントのみ返す（本日分は除外）＋note', async () => {
  const res = await call('GET', AUTH);
  assert.equal(res.statusCode, 200);
  const ids = res.body.events.map(e => e.id);
  assert.ok(ids.includes('p1'));
  assert.ok(ids.includes('arch1')); // 恒久アーカイブの過去イベントも併合される
  assert.ok(!ids.includes('f1')); // 本日は過去でない
  assert.equal(res.headers['cache-control'], 'no-store, private');
  assert.match(res.body.note, /アーカイブ/);
  assert.equal(typeof res.body.total, 'number');
});
test('不正limitは400', async () => {
  const res = await call('GET', AUTH, { limit: '999' });
  assert.equal(res.statusCode, 400);
});
test('不正日付は400', async () => {
  const res = await call('GET', AUTH, { from: '2026-02-30' });
  assert.equal(res.statusCode, 400);
});
