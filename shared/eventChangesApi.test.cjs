'use strict';
// /api/admin/event-changes・/api/watch・/api/manual-events の結合テスト（Redis はメモリ上の偽物）。
// 第2段階の完了条件:
//   - 手動追加イベント・自動収集イベントの両方で変更・中止を設定できる
//   - スクレイプ後（＝内容の上書き保存・取り消し後）も運営設定が残る
//   - 権限外の担当者は変更できない
//   - 公開APIは公開を許可した変更だけを、根拠・操作者を除いて返す
//   - 通知は確認済みの根拠つきのみ・重複送信しない
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const S = require('./session.cjs');
const fake = require('./fixtures/fakeUpstash.cjs');
const webpush = require('web-push');

process.env.LEGACY_HEADER_AUTH = 'true';
const PW = S.hashPassword('pw');
process.env.ADMIN_ACCOUNTS_B64 = Buffer.from(JSON.stringify([
  { user: 'nat', pass: PW, pref: '*', displayId: 'OP-N' },
  { user: 'tokyo', pass: PW, organization: 'tokyo', role: 'pco_admin', displayId: 'OP-T' },
  { user: 'osaka', pass: PW, organization: 'osaka', role: 'pco_admin', displayId: 'OP-O' },
  { user: 'ed', pass: PW, organization: 'tokyo', office: 'shibuya', role: 'office_editor', displayId: 'OP-E' },
  { user: 'aud', pass: PW, organization: 'tokyo', role: 'auditor', displayId: 'OP-A' },
])).toString('base64');
const vapid = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = vapid.publicKey;
process.env.VAPID_PRIVATE_KEY = vapid.privateKey;
process.env.VAPID_EMAIL = 'test@example.invalid';

// 公開中の events.json（自動収集イベント）
const SCRAPED = {
  tokyo: [{ id: 'tk-20991019-aaaa', pref: 'tokyo', date: '2099-10-19', title: '宇都宮駐屯地見学', place: '宇都宮駐屯地', time: '10:00～15:00',
    status: 'cancelled', statusReason: '中止告知', statusConfidence: 'high', statusEvidence: '…本イベントは中止となりました…' }],
  updatedAt: '2099/01/01 00:00',
};
fake.install({
  onOtherFetch: async (url) => (String(url).endsWith('/data/events.json')
    ? new Response(JSON.stringify(SCRAPED), { status: 200, headers: { 'content-type': 'application/json' } })
    : new Response('nf', { status: 404 })),
});

// プッシュ送信は実際には飛ばさず記録する
const sentPush = [];
webpush.sendNotification = async (sub, body) => { sentPush.push({ endpoint: sub.endpoint, body: JSON.parse(body) }); return { statusCode: 201 }; };

const ORIGIN = require('./siteUrl.cjs').DEFAULT_SITE_URL;
const hdr = (user) => ({ ...(user ? { 'x-admin-user': user, 'x-admin-pass': 'pw' } : {}), origin: ORIGIN, 'sec-fetch-site': 'same-origin', host: 'jsdf-chiiki-events.jp' });
async function call(path, method, user, body, query = {}) {
  const handler = (await import(path)).default;
  const res = fake.mockRes();
  await handler({ method, headers: hdr(user), query, body }, res);
  return res;
}
const changes = (m, u, b, q) => call('../api/admin/event-changes.js', m, u, b, q);
const SCRAPED_ID = 'tk-20991019-aaaa';
let manualId;

before(async () => {
  const r = await call('../api/admin/events.js', 'POST', 'nat', { event: { pref: 'tokyo', date: '2099-11-01', title: '手動の説明会', place: '渋谷', status: 'published' } });
  assert.equal(r.statusCode, 200);
  manualId = r.body.event.id;
});

test('手動イベント: 中止を登録すると開催状況が cancelled になり、変更記録が残る', async () => {
  const r = await changes('POST', 'tokyo', { id: manualId, change: { type: 'cancelled', reason: '台風接近のため', public: true } });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.equal(r.body.status, 'cancelled');
  const g = await changes('GET', 'tokyo', null, { id: manualId });
  assert.equal(g.body.status, 'cancelled');
  assert.equal(g.body.changes.length, 1);
  assert.equal(g.body.changes[0].by, 'OP-T');
  assert.equal(g.body.kind, 'manual');
});

test('自動収集イベント: 自動判定の根拠を確認でき、上書きで「開催予定に戻す」・日時変更ができる', async () => {
  const g = await changes('GET', 'tokyo', null, { id: SCRAPED_ID });
  assert.equal(g.statusCode, 200);
  assert.equal(g.body.kind, 'scraped');
  assert.equal(g.body.auto.status, 'cancelled');
  assert.match(g.body.auto.evidence, /中止/);
  const r1 = await changes('POST', 'tokyo', { id: SCRAPED_ID, change: { type: 'resumed', reason: '自動判定の誤り（公式ページで開催を確認）', public: false } });
  assert.equal(r1.statusCode, 200, JSON.stringify(r1.body));
  assert.equal(r1.body.status, 'published');
  const r2 = await changes('POST', 'tokyo', { id: SCRAPED_ID, change: { type: 'datetime', before: '2099-10-19', after: '2099-10-26 10:00～15:00', public: true, apply: { date: '2099-10-26' } } });
  assert.equal(r2.statusCode, 200, JSON.stringify(r2.body));
  const rec = JSON.parse(fake.store.get('manual:overrides').get(SCRAPED_ID));
  assert.equal(rec.status, 'published');
  assert.equal(rec.date, '2099-10-26');
  assert.equal(rec.weekday, '月');
  assert.equal(rec.changes.length, 2);
  assert.equal(rec._pref, 'tokyo');
});

test('運営設定はスクレイプ後も残る: 表示内容の上書き保存・取り消しで status/changes を消さない', async () => {
  const save = await call('../api/admin/overrides.js', 'POST', 'tokyo', { id: SCRAPED_ID, patch: { title: '宇都宮駐屯地見学（修正）' } });
  assert.equal(save.statusCode, 200);
  let rec = JSON.parse(fake.store.get('manual:overrides').get(SCRAPED_ID));
  assert.equal(rec.title, '宇都宮駐屯地見学（修正）');
  assert.equal(rec.changes.length, 2, '内容の上書き保存で変更記録が消えた');
  assert.equal(rec.status, 'published');
  const clear = await call('../api/admin/overrides.js', 'DELETE', 'tokyo', { id: SCRAPED_ID });
  assert.equal(clear.statusCode, 200);
  rec = JSON.parse(fake.store.get('manual:overrides').get(SCRAPED_ID));
  assert.equal(rec.title, undefined, '表示内容の上書きは取り消される');
  assert.equal(rec.changes.length, 2, '上書き取り消しで変更記録が消えた');
});

test('権限外は変更できない（他地本・office不一致・監査ロール・未ログイン）', async () => {
  const body = { id: SCRAPED_ID, change: { type: 'cancelled', reason: 'x', public: true } };
  assert.equal((await changes('POST', 'osaka', body)).statusCode, 403);
  assert.equal((await changes('POST', 'ed', body)).statusCode, 403);   // スクレイプ品は office が無い＝office ロールは不可
  assert.equal((await changes('POST', 'aud', body)).statusCode, 403);
  assert.equal((await changes('POST', null, body)).statusCode, 401);
  assert.equal((await changes('GET', 'osaka', null, { id: manualId })).statusCode, 403, '他地本の非公開記録を読めない');
  assert.equal((await changes('POST', 'tokyo', { id: 'does-not-exist', change: body.change })).statusCode, 404);
  // 監査ログに拒否が残る
  const audit = (fake.store.get('manual:history') || []).map(s => JSON.parse(s));
  assert.ok(audit.some(a => a.action === 'event.change' && a.result === 'denied'));
});

test('公開APIは公開を許可した変更だけを、根拠・操作者を除いて返す', async () => {
  await changes('POST', 'tokyo', { id: manualId, change: { type: 'notice', after: '内部メモ', public: false } });
  const r = await call('../api/manual-events.js', 'GET', null, null);
  const ev = r.body.events.find(e => e.id === manualId);
  assert.equal(ev.status, 'cancelled');
  assert.deepEqual(ev.changes.map(c => c.type), ['cancelled']);
  for (const c of ev.changes) { assert.equal(c.by, undefined); assert.equal(c.evidence, undefined); }
  const o = r.body.overrides[SCRAPED_ID];
  assert.deepEqual(o.changes.map(c => c.type), ['datetime'], '非公開の「開催予定に戻す」は出ない');
  assert.equal(o.status, 'published');
});

test('公開/非公開の切り替えと取り消し（取り消しでは開催状況を戻さない）', async () => {
  const g = await changes('GET', 'tokyo', null, { id: manualId });
  const hidden = g.body.changes.find(c => c.type === 'notice');
  assert.equal((await changes('PATCH', 'tokyo', { id: manualId, changeId: hidden.id, public: true })).statusCode, 200);
  let pub = (await call('../api/manual-events.js', 'GET', null, null)).body.events.find(e => e.id === manualId);
  assert.ok(pub.changes.some(c => c.type === 'notice'));
  assert.equal((await changes('DELETE', 'tokyo', { id: manualId, changeId: hidden.id })).statusCode, 200);
  pub = (await call('../api/manual-events.js', 'GET', null, null)).body.events.find(e => e.id === manualId);
  assert.ok(!pub.changes.some(c => c.type === 'notice'));
  assert.equal(pub.status, 'cancelled');
});

test('通知: 見守り登録した端末にだけ送る。根拠なしは拒否・同じ内容は24時間送り直さない', async () => {
  const endpoint = 'https://fcm.googleapis.com/fcm/send/test-endpoint-1';
  // 購読が無い宛先は見守り登録できない
  assert.equal((await call('../api/watch.js', 'POST', null, { endpoint, eventIds: [SCRAPED_ID] })).statusCode, 404);
  fake.store.set('push:subscriptions', new Map([[endpoint, JSON.stringify({ endpoint, keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' } })]]));
  const w = await call('../api/watch.js', 'POST', null, { endpoint, eventIds: [SCRAPED_ID, 'bad id!'] });
  assert.equal(w.statusCode, 400, '不正なIDは拒否');
  assert.equal((await call('../api/watch.js', 'POST', null, { endpoint, eventIds: [SCRAPED_ID] })).statusCode, 200);

  const change = { type: 'venue', before: '宇都宮駐屯地', after: '宇都宮駐屯地 体育館（雨天のため）', public: true, notify: true };
  const noEvidence = await changes('POST', 'tokyo', { id: SCRAPED_ID, change });
  assert.equal(noEvidence.statusCode, 400);
  assert.match(noEvidence.body.error, /根拠/);

  const ok = await changes('POST', 'tokyo', { id: SCRAPED_ID, change: { ...change, evidence: 'https://www.mod.go.jp/pco/tokyo/', confirmed: true } });
  assert.equal(ok.statusCode, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.notify.sent, 1);
  assert.equal(sentPush.length, 1);
  assert.equal(sentPush[0].body.title, '【会場変更】宇都宮駐屯地見学');
  assert.equal(sentPush[0].body.url, `/event/${SCRAPED_ID}`);

  const dup = await changes('POST', 'tokyo', { id: SCRAPED_ID, change: { ...change, evidence: 'https://www.mod.go.jp/pco/tokyo/', confirmed: true } });
  assert.equal(dup.statusCode, 200);
  assert.equal(dup.body.notify.skipped, 'duplicate');
  assert.equal(sentPush.length, 1, '同じ内容を二重送信した');

  // 見守りを外すと届かない
  assert.equal((await call('../api/watch.js', 'DELETE', null, { endpoint })).statusCode, 200);
  const after = await changes('POST', 'tokyo', { id: SCRAPED_ID, change: { type: 'notice', after: '駐車場はありません', public: true, notify: true, evidence: '電話で確認', confirmed: true } });
  assert.equal(after.body.notify.watchers, 0);
  assert.equal(sentPush.length, 1);
});

test('下書きの手動イベントは通知できず、延期を登録しても公開にならない', async () => {
  const r = await call('../api/admin/events.js', 'POST', 'nat', { event: { pref: 'tokyo', date: '2099-12-01', title: '下書き', status: 'draft' } });
  const id = r.body.event.id;
  const n = await changes('POST', 'tokyo', { id, change: { type: 'postponed', reason: '調整中', public: true, notify: true, evidence: 'x', confirmed: true } });
  assert.equal(n.statusCode, 400);
  const p = await changes('POST', 'tokyo', { id, change: { type: 'postponed', reason: '調整中', public: true } });
  assert.equal(p.statusCode, 200);
  assert.equal(p.body.status, 'draft');
  const pub = await call('../api/manual-events.js', 'GET', null, null);
  assert.ok(!pub.body.events.some(e => e.id === id), '下書きが公開された');
});

test('延期（postponed）は公開APIを通る', async () => {
  const r = await call('../api/admin/events.js', 'POST', 'nat', { event: { pref: 'tokyo', date: '2099-12-02', title: '延期される催し', status: 'published' } });
  const id = r.body.event.id;
  await changes('POST', 'tokyo', { id, change: { type: 'postponed', reason: '会場都合', after: '新しい日程は決まり次第お知らせします', public: true } });
  const pub = await call('../api/manual-events.js', 'GET', null, null);
  const ev = pub.body.events.find(e => e.id === id);
  assert.equal(ev.status, 'postponed');
  assert.equal(ev.changes[0].type, 'postponed');
});

test('通知の送信に失敗しても変更は保存され、重複防止の印を外して再送できる', async () => {
  const endpoint = 'https://fcm.googleapis.com/fcm/send/test-endpoint-2';
  fake.store.set('push:subscriptions', new Map([[endpoint, JSON.stringify({ endpoint, keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' } })]]));
  assert.equal((await call('../api/watch.js', 'POST', null, { endpoint, eventIds: [SCRAPED_ID] })).statusCode, 200);
  // 購読情報の読み出し（HMGET）だけを失敗させる
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(init && init.body).includes('"hmget"')) return new Response(JSON.stringify({ error: 'boom' }), { status: 500 });
    return realFetch(url, init);
  };
  const change = { type: 'notice', after: '集合場所が変わりました', public: true, notify: true, evidence: '公式ページ', confirmed: true };
  let r;
  try { r = await changes('POST', 'tokyo', { id: SCRAPED_ID, change }); } finally { globalThis.fetch = realFetch; }
  assert.equal(r.statusCode, 200, '変更自体は保存して 200');
  assert.equal(r.body.notify.error, 'send_failed');
  const rec = JSON.parse(fake.store.get('manual:overrides').get(SCRAPED_ID));
  assert.ok(rec.changes.some(c => c.after === '集合場所が変わりました'));
  // 再登録すれば送れる（24時間の重複扱いにならない）
  const before = sentPush.length;
  const again = await changes('POST', 'tokyo', { id: SCRAPED_ID, change });
  assert.equal(again.body.notify.sent, 1);
  assert.equal(sentPush.length, before + 1);
});
