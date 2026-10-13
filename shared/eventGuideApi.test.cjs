'use strict';
// /api/admin/event-guides と /api/admin/events（新規登録時のFAQ）・/api/manual-events の結合テスト
const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('./session.cjs');
const fake = require('./fixtures/fakeUpstash.cjs');

process.env.LEGACY_HEADER_AUTH = 'true';
const PW = S.hashPassword('pw');
process.env.ADMIN_ACCOUNTS_B64 = Buffer.from(JSON.stringify([
  { user: 'tokyo', pass: PW, organization: 'tokyo', role: 'pco_admin', displayId: 'OP-T' },
  { user: 'osaka', pass: PW, organization: 'osaka', role: 'pco_admin', displayId: 'OP-O' },
  { user: 'ed', pass: PW, organization: 'tokyo', office: 'shibuya', role: 'office_editor', displayId: 'OP-E' },
])).toString('base64');
const SCRAPED = { tokyo: [{ id: 'tk-20991020-bbbb', pref: 'tokyo', date: '2099-10-20', title: '自衛隊説明会' }] };
fake.install({ onOtherFetch: async (url) => (String(url).endsWith('/data/events.json') ? Response.json(SCRAPED) : new Response('', { status: 404 })) });

const ORIGIN = require('./siteUrl.cjs').DEFAULT_SITE_URL;
async function call(path, method, user, body, query = {}) {
  const handler = (await import(path)).default;
  const res = fake.mockRes();
  await handler({ method, headers: { ...(user ? { 'x-admin-user': user, 'x-admin-pass': 'pw' } : {}), origin: ORIGIN, 'sec-fetch-site': 'same-origin', host: 'jsdf-chiiki-events.jp' }, query, body }, res);
  return res;
}
const guides = (m, u, b, q) => call('../api/admin/_event-guides.js', m, u, b, q);
const pub = () => call('../api/manual-events.js', 'GET', null, null);

test('手動イベント: 新規登録時に FAQ・ガイドを一緒に保存し、公開分だけが公開APIに出る', async () => {
  const r = await call('../api/admin/_events.js', 'POST', 'tokyo', { event: {
    pref: 'tokyo', date: '2099-11-01', title: '説明会', status: 'published',
    faq: [{ q: '予約は必要？', a: '必要です' }, { q: '内部用', a: 'メモ', public: false }],
    guide: { fee: { state: 'confirmed', text: '無料' }, parking: { state: 'unknown', text: '' } },
  } });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  const ev = (await pub()).body.events.find(e => e.id === r.body.event.id);
  assert.deepEqual(ev.faq.map(f => f.q), ['予約は必要？']);
  assert.deepEqual(ev.guide.map(g => g.id), ['fee']);
});

test('自動収集イベント: 上書きに保存され、並べ替え・公開切替・削除が反映される', async () => {
  const id = 'tk-20991020-bbbb';
  const put1 = await guides('PUT', 'tokyo', { id, faq: [{ q: 'Q1', a: 'A1' }, { q: 'Q2', a: 'A2' }], guide: { rain: { state: 'confirmed', text: '小雨決行' } } });
  assert.equal(put1.statusCode, 200, JSON.stringify(put1.body));
  const [f1, f2] = put1.body.faq;
  // 並べ替え＋2件目を非公開
  const put2 = await guides('PUT', 'tokyo', { id, faq: [{ ...f2, public: false }, f1], guide: put1.body.guide });
  assert.deepEqual(put2.body.faq.map(f => f.id), [f2.id, f1.id], 'IDを保ったまま並べ替わる');
  let o = (await pub()).body.overrides[id];
  assert.deepEqual(o.faq.map(f => f.q), ['Q1']);
  assert.equal(o.guide[0].text, '小雨決行');
  // 全削除で上書きから faq/guide が消える
  const put3 = await guides('PUT', 'tokyo', { id, faq: [], guide: {} });
  assert.equal(put3.statusCode, 200);
  o = (await pub()).body.overrides[id];
  assert.equal(o && o.faq, undefined);
  // 監査ログ
  const audit = (fake.store.get('manual:history') || []).map(s => JSON.parse(s));
  assert.ok(audit.filter(a => a.action === 'event.guide' && a.result === 'success').length >= 3);
});

test('FAQ はスクレイプ後も残る: 表示内容の上書き保存・取り消しで消えない', async () => {
  const id = 'tk-20991020-bbbb';
  await guides('PUT', 'tokyo', { id, faq: [{ q: '駐車場は？', a: 'ありません' }], guide: {} });
  await call('../api/admin/_overrides.js', 'POST', 'tokyo', { id, patch: { title: '自衛隊説明会（修正）' } });
  await call('../api/admin/_overrides.js', 'DELETE', 'tokyo', { id });
  const g = await guides('GET', 'tokyo', null, { id });
  assert.deepEqual(g.body.faq.map(f => f.q), ['駐車場は？']);
});

test('入力検証と権限: 片方だけの行・確認済みの空本文は 400、担当外・office不一致は 403', async () => {
  const id = 'tk-20991020-bbbb';
  assert.equal((await guides('PUT', 'tokyo', { id, faq: [{ q: 'Q', a: '' }] })).statusCode, 400);
  assert.equal((await guides('PUT', 'tokyo', { id, guide: { idCard: { state: 'confirmed', text: '' } } })).statusCode, 400);
  assert.equal((await guides('PUT', 'osaka', { id, faq: [] })).statusCode, 403);
  assert.equal((await guides('PUT', 'ed', { id, faq: [] })).statusCode, 403);
  assert.equal((await guides('GET', 'osaka', null, { id })).statusCode, 403, '担当外の非公開FAQを読めない');
  assert.equal((await guides('PUT', null, { id, faq: [] })).statusCode, 401);
  assert.equal((await guides('PUT', 'tokyo', { id: '../../x', faq: [] })).statusCode, 400);
});

test('交通アクセス: 入場口・推奨駅を保存し、公開APIは検証済みの形だけを返す。不正な座標・URLは 400', async () => {
  const id = 'tk-20991020-bbbb';
  const bad = await guides('PUT', 'tokyo', { id, access: { entranceLat: '91', entranceLon: '139' } });
  assert.equal(bad.statusCode, 400);
  assert.equal((await guides('PUT', 'tokyo', { id, access: { url: 'javascript:alert(1)' } })).statusCode, 400);
  const ok = await guides('PUT', 'tokyo', { id, faq: [], guide: {}, access: { entranceLabel: '正門', entranceLat: '36.574', entranceLon: '139.876', station: 'JR宇都宮駅', url: 'https://www.mod.go.jp/' } });
  assert.equal(ok.statusCode, 200, JSON.stringify(ok.body));
  const o = (await pub()).body.overrides[id];
  assert.deepEqual(o.access.entrance, { lat: 36.574, lon: 139.876, label: '正門' });
  assert.equal(o.access.station, 'JR宇都宮駅');
  // 内容の上書き保存でも残る
  await call('../api/admin/_overrides.js', 'POST', 'tokyo', { id, patch: { title: '自衛隊説明会' } });
  assert.equal((await guides('GET', 'tokyo', null, { id })).body.access.station, 'JR宇都宮駅');
});
