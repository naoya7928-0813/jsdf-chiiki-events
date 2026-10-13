'use strict';
// イベントごとの編集記録（誰が追加・修正したか）の単体・結合テスト（Redis はメモリ上の偽物）。
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const L = require('./editLog.cjs');
const S = require('./session.cjs');
const fake = require('./fixtures/fakeUpstash.cjs');

test('changedFields: 変わった項目だけを日本語名で返す（メタ情報は除く）', () => {
  const f = L.changedFields({ title: 'A', place: 'X', updatedAt: '1', _by: 'a' }, { title: 'B', place: 'X', updatedAt: '2', _by: 'b', tags: ['抽選'] });
  assert.deepEqual(f.sort(), ['イベント名', 'タグ'].sort());
});

test('appendLog: 新しい順・最大件数・不正な action は「修正」', () => {
  let log = [];
  for (let i = 0; i < L.MAX_LOG + 5; i++) log = L.appendLog(log, { by: 'OP', action: 'update', at: `2026-10-13T00:00:${String(i % 60).padStart(2, '0')}Z` });
  assert.equal(log.length, L.MAX_LOG);
  assert.equal(L.appendLog([], { by: 'OP', action: 'evil' })[0].action, 'update');
  const w = L.withLog({ title: 'B', _log: [{ at: 'x', by: 'OP-A', action: 'create' }] }, { by: 'OP-B', action: 'update', before: { title: 'A' } });
  assert.equal(w._log[0].by, 'OP-B');
  assert.deepEqual(w._log[0].fields, ['イベント名']);
  assert.deepEqual(L.authorship(w), { createdBy: 'OP-A', createdAt: 'x', updatedBy: 'OP-B', updatedAt: w._log[0].at });
  assert.match(L.describeLog(w._log[0]), /修正（イベント名）/);
});

// ── 結合 ──
process.env.LEGACY_HEADER_AUTH = 'true';
const PW = S.hashPassword('pw');
process.env.ADMIN_ACCOUNTS_B64 = Buffer.from(JSON.stringify([
  { user: 'tokyo', pass: PW, organization: 'tokyo', role: 'pco_admin', displayId: 'OP-T' },
  { user: 'tokyo2', pass: PW, organization: 'tokyo', role: 'pco_admin', displayId: 'OP-T2' },
  { user: 'osaka', pass: PW, organization: 'osaka', role: 'pco_admin', displayId: 'OP-O' },
])).toString('base64');
const SCRAPED = { tokyo: [{ id: 'tk-20991019-log1', pref: 'tokyo', date: '2099-10-19', title: '駐屯地見学', place: '練馬駐屯地' }], updatedAt: '2099/01/01 00:00' };
fake.install({
  onOtherFetch: async (url) => (String(url).endsWith('/data/events.json')
    ? new Response(JSON.stringify(SCRAPED), { status: 200, headers: { 'content-type': 'application/json' } })
    : new Response('nf', { status: 404 })),
});
const ORIGIN = require('./siteUrl.cjs').DEFAULT_SITE_URL;
const hdr = (user) => ({ ...(user ? { 'x-admin-user': user, 'x-admin-pass': 'pw' } : {}), origin: ORIGIN, 'sec-fetch-site': 'same-origin', host: 'jsdf-chiiki-events.jp' });
async function call(path, method, user, body, query = {}) {
  const handler = (await import(path)).default;
  const res = fake.mockRes();
  await handler({ method, headers: hdr(user), query, body }, res);
  return res;
}
let manualId;
before(async () => {
  const r = await call('../api/admin/_events.js', 'POST', 'tokyo', { event: { pref: 'tokyo', date: '2099-11-01', title: '説明会', place: '渋谷', status: 'published' } });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  manualId = r.body.event.id;
});

test('手動イベント: 追加者・修正者・変更項目が記録され、運営画面から読める', async () => {
  await call('../api/admin/_events.js', 'PATCH', 'tokyo2', { id: manualId, patch: { title: '説明会（会場変更）', place: '新宿' } });
  await call('../api/admin/_events.js', 'PATCH', 'tokyo', { id: manualId, patch: { status: 'draft' } });
  const h = await call('../api/admin/_history.js', 'GET', 'tokyo', null, { targetId: manualId });
  assert.equal(h.statusCode, 200, JSON.stringify(h.body));
  assert.equal(h.body.createdBy, 'OP-T');
  assert.equal(h.body.updatedBy, 'OP-T');
  assert.deepEqual(h.body.log.map(x => [x.by, x.action]), [['OP-T', 'status'], ['OP-T2', 'update'], ['OP-T', 'create']]);
  assert.deepEqual(h.body.log[1].fields.sort(), ['イベント名', '会場'].sort());
  assert.ok(Array.isArray(h.body.audit) && h.body.audit.length >= 3, '監査権限があれば監査ログも返す');
});

test('自動収集イベント: 上書き・取り消しの記録が残り、取り消し後も消えない', async () => {
  const id = 'tk-20991019-log1';
  assert.equal((await call('../api/admin/_overrides.js', 'POST', 'tokyo', { id, patch: { title: '駐屯地見学（修正）' } })).statusCode, 200);
  assert.equal((await call('../api/admin/_overrides.js', 'DELETE', 'tokyo2', { id })).statusCode, 200);
  const h = await call('../api/admin/_history.js', 'GET', 'tokyo', null, { targetId: id });
  assert.equal(h.statusCode, 200);
  assert.deepEqual(h.body.log.map(x => [x.by, x.action]), [['OP-T2', 'override-clear'], ['OP-T', 'override']]);
  assert.equal(h.body.updatedBy, 'OP-T2');
});

test('担当外・不正IDは読めない', async () => {
  assert.equal((await call('../api/admin/_history.js', 'GET', 'osaka', null, { targetId: manualId })).statusCode, 403);
  assert.equal((await call('../api/admin/_history.js', 'GET', 'tokyo', null, { targetId: '../x' })).statusCode, 400);
  assert.equal((await call('../api/admin/_history.js', 'GET', 'tokyo', null, { targetId: 'nope-1' })).statusCode, 404);
});

test('公開APIには編集記録（_log）・作成者を出さない', async () => {
  await call('../api/admin/_events.js', 'PATCH', 'tokyo', { id: manualId, patch: { status: 'published' } });
  const r = await call('../api/manual-events.js', 'GET', null, null);
  const ev = r.body.events.find(e => e.id === manualId);
  assert.ok(ev, '公開されていない');
  assert.ok(!('_log' in ev) && !('createdBy' in ev) && !('updatedBy' in ev));
  for (const o of Object.values(r.body.overrides)) assert.ok(!('_log' in o));
});
