'use strict';
// /api/admin/images の結合テスト（Redis はメモリ上の偽物）。
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const S = require('./session.cjs');
const fake = require('./fixtures/fakeUpstash.cjs');
const I = require('./eventImages.cjs');

process.env.LEGACY_HEADER_AUTH = 'true';
const PW = S.hashPassword('pw');
process.env.ADMIN_ACCOUNTS_B64 = Buffer.from(JSON.stringify([
  { user: 'tokyo', pass: PW, organization: 'tokyo', role: 'pco_admin', displayId: 'OP-T' },
  { user: 'osaka', pass: PW, organization: 'osaka', role: 'pco_admin', displayId: 'OP-O' },
  { user: 'aud', pass: PW, organization: 'tokyo', role: 'auditor', displayId: 'OP-A' },
])).toString('base64');
const SCRAPED = { tokyo: [{ id: 'tk-20991019-img1', pref: 'tokyo', date: '2099-10-19', title: '駐屯地見学', place: '練馬駐屯地' }], updatedAt: '2099/01/01 00:00' };
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
const images = (m, u, b, q) => call('../api/admin/_images.js', m, u, b, q);
const JPEG = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]).toString('base64');
const PNG_AS_JPEG = 'data:image/jpeg;base64,' + Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]).toString('base64');
const META = { credit: '自衛隊東京地方協力本部ホームページ（https://www.mod.go.jp/pco/tokyo/）', alt: '会場', rightsConfirmed: true, public: true };
let manualId;

before(async () => {
  const r = await call('../api/admin/_events.js', 'POST', 'tokyo', { event: { pref: 'tokyo', date: '2099-11-01', title: '説明会', place: '渋谷', status: 'published' } });
  manualId = r.body.event.id;
});

test('手動イベント: 追加・一覧・画像データ取得・説明の修正・並べ替え・削除', async () => {
  const a = await images('POST', 'tokyo', { eventId: manualId, data: JPEG, ...META });
  assert.equal(a.statusCode, 200, JSON.stringify(a.body));
  const b = await images('POST', 'tokyo', { eventId: manualId, data: JPEG, credit: '出典B' });
  assert.equal(b.statusCode, 200);
  const id1 = a.body.image.id; const id2 = b.body.image.id;
  assert.match(id1, I.IMAGE_ID_RE);
  assert.ok(fake.store.has(`img:${id1}`));

  const list = await images('GET', 'tokyo', null, { eventId: manualId });
  assert.equal(list.statusCode, 200);
  assert.deepEqual(list.body.images.map(x => x.id), [id1, id2]);
  assert.equal(list.body.images[0].by, 'OP-T');
  assert.equal(list.body.publicDisplay, false);
  assert.equal(list.body.images[1].rightsConfirmed, false, '未指定は権利未確認');

  const raw = await images('GET', 'tokyo', null, { eventId: manualId, imageId: id1, raw: '1' });
  assert.equal(raw.statusCode, 200);
  assert.equal(raw.headers['content-type'], 'image/jpeg');
  assert.equal(raw.headers['x-content-type-options'], 'nosniff');

  assert.equal((await images('PATCH', 'tokyo', { eventId: manualId, imageId: id2, alt: '説明B', rightsConfirmed: true })).statusCode, 200);
  assert.equal((await images('PATCH', 'tokyo', { eventId: manualId, imageId: id2, move: -1 })).statusCode, 200);
  const l2 = await images('GET', 'tokyo', null, { eventId: manualId });
  assert.deepEqual(l2.body.images.map(x => x.id), [id2, id1]);
  assert.equal(l2.body.images[0].alt, '説明B');
  assert.equal(l2.body.images[0].credit, '出典B', '指定しない項目は保持');

  assert.equal((await images('PATCH', 'tokyo', { eventId: manualId, imagesHidden: true })).statusCode, 200);
  assert.equal((await images('GET', 'tokyo', null, { eventId: manualId })).body.imagesHidden, true);

  assert.equal((await images('DELETE', 'tokyo', { eventId: manualId, imageId: id2 })).statusCode, 200);
  assert.ok(!fake.store.has(`img:${id2}`), '画像データも消える');
  assert.deepEqual((await images('GET', 'tokyo', null, { eventId: manualId })).body.images.map(x => x.id), [id1]);
});

test('公開APIは画像を返さない（公開画面は「（現在準備中）」のみ）', async () => {
  const r = await call('../api/manual-events.js', 'GET', null, null);
  const ev = r.body.events.find(e => e.id === manualId);
  assert.ok(ev);
  assert.ok(!('images' in ev) && !('imagesHidden' in ev));
});

test('自動収集イベント: 上書きに保存され、上書きの取り消しでも画像は残る', async () => {
  const id = 'tk-20991019-img1';
  assert.equal((await images('POST', 'tokyo', { eventId: id, data: JPEG, ...META })).statusCode, 200);
  await call('../api/admin/_overrides.js', 'POST', 'tokyo', { id, patch: { title: '見学（修正）' } });
  await call('../api/admin/_overrides.js', 'DELETE', 'tokyo', { id });
  assert.equal((await images('GET', 'tokyo', null, { eventId: id })).body.images.length, 1);
  const pub = await call('../api/manual-events.js', 'GET', null, null);
  assert.ok(!('images' in (pub.body.overrides[id] || {})));
});

test('検証: 形式の偽装・出典なしでも登録はできるが公開対象にならない・上限・担当外・権限', async () => {
  assert.equal((await images('POST', 'tokyo', { eventId: manualId, data: PNG_AS_JPEG, ...META })).statusCode, 400);
  assert.equal((await images('POST', 'tokyo', { eventId: manualId, data: 'data:image/svg+xml;base64,PHN2Zz4=', ...META })).statusCode, 400);
  const big = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(I.MAX_IMAGE_BYTES)]).toString('base64');
  assert.equal((await images('POST', 'tokyo', { eventId: manualId, data: big, ...META })).statusCode, 400);
  assert.equal((await images('POST', 'osaka', { eventId: manualId, data: JPEG, ...META })).statusCode, 403);
  assert.equal((await images('GET', 'osaka', null, { eventId: manualId })).statusCode, 403);
  assert.equal((await images('POST', 'aud', { eventId: manualId, data: JPEG, ...META })).statusCode, 403);
  assert.equal((await images('POST', 'tokyo', { eventId: 'nope-1', data: JPEG, ...META })).statusCode, 404);
  // 上限
  for (let n = (await images('GET', 'tokyo', null, { eventId: manualId })).body.images.length; n < I.MAX_IMAGES; n++) {
    assert.equal((await images('POST', 'tokyo', { eventId: manualId, data: JPEG, ...META })).statusCode, 200);
  }
  assert.equal((await images('POST', 'tokyo', { eventId: manualId, data: JPEG, ...META })).statusCode, 400);
});

test('イベントを削除すると画像データも消える・編集記録に残る', async () => {
  const before = (await images('GET', 'tokyo', null, { eventId: manualId })).body.images.map(x => x.id);
  const h = await call('../api/admin/_history.js', 'GET', 'tokyo', null, { targetId: manualId });
  assert.ok(h.body.log.some(x => x.action === 'image'), '画像の操作が編集記録に残る');
  assert.equal((await call('../api/admin/_events.js', 'DELETE', 'tokyo', { id: manualId })).statusCode, 200);
  for (const id of before) assert.ok(!fake.store.has(`img:${id}`), id);
});
