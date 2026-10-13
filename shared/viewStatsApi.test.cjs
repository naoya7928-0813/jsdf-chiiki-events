'use strict';
// /api/view（計測）と /api/admin/view-stats（運営の閲覧）の結合テスト（Redis はメモリ上の偽物）
const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('./session.cjs');
const fake = require('./fixtures/fakeUpstash.cjs');
const V = require('./viewStats.cjs');

process.env.LEGACY_HEADER_AUTH = 'true';
const PW = S.hashPassword('pw');
process.env.ADMIN_ACCOUNTS_B64 = Buffer.from(JSON.stringify([
  { user: 'tokyo', pass: PW, organization: 'tokyo', role: 'pco_admin', displayId: 'OP-T' },
  { user: 'osaka', pass: PW, organization: 'osaka', role: 'pco_admin', displayId: 'OP-O' },
  { user: 'nat', pass: PW, pref: '*', displayId: 'OP-N' },
])).toString('base64');
const DATA = {
  tokyo: [{ id: 'tk-1', pref: 'tokyo', date: '2099-10-01', title: '東京の説明会' }, { id: 'tk-2', pref: 'tokyo', date: '2099-10-02', title: '東京の見学' }],
  osaka: [{ id: 'os-1', pref: 'osaka', date: '2099-10-03', title: '大阪の説明会' }],
};
fake.install({ onOtherFetch: async (url) => (String(url).endsWith('/data/events.json') ? Response.json(DATA) : new Response('', { status: 404 })) });

const ORIGIN = require('./siteUrl.cjs').DEFAULT_SITE_URL;
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
async function view(id, { ip = '203.0.113.1', ua = UA, origin = ORIGIN, site = 'same-origin', method = 'POST' } = {}) {
  const handler = (await import('../api/view.js')).default;
  const res = fake.mockRes();
  await handler({ method, headers: { ...(origin ? { origin } : {}), 'sec-fetch-site': site, 'user-agent': ua, 'x-real-ip': ip, host: 'jsdf-chiiki-events.jp' }, body: { id } }, res);
  return res;
}
async function stats(user, query = {}) {
  const handler = (await import('../api/admin/_view-stats.js')).default;
  const res = fake.mockRes();
  await handler({ method: 'GET', headers: { 'x-admin-user': user, 'x-admin-pass': 'pw', origin: ORIGIN, 'sec-fetch-site': 'same-origin', host: 'jsdf-chiiki-events.jp' }, query }, res);
  return res;
}
const total = (id) => Number(fake.store.get(V.TOTAL_KEY)?.get(id) || 0);

test('1回の閲覧を数え、同じ通信元・同じイベントの再送（再試行・連打・別タブ）は30分数えない', async () => {
  assert.equal((await view('tk-1')).statusCode, 202);
  assert.equal(total('tk-1'), 1);
  await view('tk-1'); await view('tk-1');
  assert.equal(total('tk-1'), 1, '重複して数えた');
  await view('tk-1', { ip: '198.51.100.7' });   // 別の通信元は別の閲覧
  assert.equal(total('tk-1'), 2);
  const day = fake.store.get(V.dayKey(V.jstDay()));
  assert.equal(Number(day.get('tk-1')), 2, '日別（JST）にも記録');
  // 30分の印は IP そのものではなくハッシュ
  const seenKeys = [...fake.store.keys()].filter(k => k.startsWith('views:seen:'));
  assert.ok(seenKeys.length >= 2);
  assert.ok(seenKeys.every(k => !k.includes('203.0.113.1')));
});

test('数えないもの: ボット・自サイト外・Origin なし・存在しないID・不正ID・GET', async () => {
  const before = total('tk-2');
  await view('tk-2', { ua: 'Googlebot/2.1' });
  await view('tk-2', { ua: '' });
  await view('tk-2', { site: 'cross-site' });
  await view('tk-2', { origin: null });
  assert.equal(total('tk-2'), before);
  assert.equal((await view('nope-404')).statusCode, 202);
  assert.equal(total('nope-404'), 0, '存在しないIDで集計キーを増やさない');
  assert.equal((await view('tk-2~2')).statusCode, 400);
  assert.equal((await view('tk-2', { origin: 'https://evil.example' })).statusCode, 403);
  assert.equal((await view('tk-2', { method: 'GET' })).statusCode, 405);
});

test('運営: 担当範囲のイベントだけの閲覧数を返し、担当外の個別統計は 403', async () => {
  await view('os-1', { ip: '203.0.113.99' });
  const t = await stats('tokyo');
  assert.equal(t.statusCode, 200);
  assert.deepEqual(t.body.rows.map(r => r.id).sort(), ['tk-1', 'tk-2']);
  const r1 = t.body.rows.find(r => r.id === 'tk-1');
  assert.equal(r1.total, 2); assert.equal(r1.today, 2); assert.equal(r1.d7, 2); assert.equal(r1.d30, 2);
  assert.equal((await stats('osaka', { id: 'tk-1' })).statusCode, 403);
  const one = await stats('tokyo', { id: 'tk-1' });
  assert.equal(one.body.series.length, 30);
  assert.equal(one.body.series[29].count, 2, '推移の末尾が今日');
  const n = await stats('nat');
  assert.equal(n.body.rows.length, 3, '全国管理者は全件');
});

test('統計は計測API以外から変更できず、累計キーは失効しない（再デプロイ・スクレイプで消えない）', async () => {
  assert.equal(fake.ttl.has(V.TOTAL_KEY), false);
  assert.ok(fake.ttl.has(V.dayKey(V.jstDay())), '日別は40日で失効させる');
  const handler = (await import('../api/admin/_view-stats.js')).default;
  const res = fake.mockRes();
  await handler({ method: 'POST', headers: { 'x-admin-user': 'nat', 'x-admin-pass': 'pw', origin: ORIGIN, 'sec-fetch-site': 'same-origin' }, query: {}, body: {} }, res);
  assert.equal(res.statusCode, 405);
});

test('レート制限: 同じ通信元から 10 分に 60 回まで', async () => {
  const ip = '192.0.2.50';
  let last;
  for (let i = 0; i < 61; i++) last = await view(`tk-${(i % 2) + 1}`, { ip });
  assert.equal(last.statusCode, 429);
});


test('出力用（report=1）: 掲載中・過去（アーカイブ）を担当範囲だけ返し、閲覧数を付ける', async () => {
  const t = await stats('tokyo', { report: '1' });
  assert.equal(t.statusCode, 200, JSON.stringify(t.body));
  assert.ok(Array.isArray(t.body.rows) && t.body.rows.length > 0);
  assert.ok(t.body.rows.every(r => r.pref === 'tokyo'), '担当外の地本を含めない');
  assert.ok(t.body.rows.some(r => r.kind === 'archive'), '過去（アーカイブ）を含む');
  assert.ok(t.body.rows.every(r => Number.isInteger(r.total) && Number.isInteger(r.d30)));
  const n = await stats('nat', { report: '1' });
  assert.ok(n.body.rows.length >= t.body.rows.length);
  assert.ok(new Set(n.body.rows.map(r => r.pref)).size > 1);
});
