'use strict';
// shared/viewStats.cjs のテスト（閲覧数の集計・重複防止の純粋ロジック）
const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('./viewStats.cjs');

test('jstDay / lastNDays: 日付の区切りは日本時間', () => {
  // 2026-10-13 15:30 UTC = 10/14 00:30 JST
  assert.equal(V.jstDay(Date.UTC(2026, 9, 13, 15, 30)), '2026-10-14');
  assert.equal(V.jstDay(Date.UTC(2026, 9, 13, 14, 59)), '2026-10-13');
  const d = V.lastNDays(3, Date.UTC(2026, 9, 13, 15, 30));
  assert.deepEqual(d, ['2026-10-14', '2026-10-13', '2026-10-12']);
  assert.equal(V.lastNDays(30).length, 30);
});

test('aggregate: 今日・7日・30日・累計', () => {
  const ids = ['a', 'b'];
  const dayMaps = Array.from({ length: 30 }, (_, i) => (i === 0 ? { a: 2 } : i === 6 ? { a: 3, b: 1 } : i === 7 ? { a: 10 } : i === 29 ? { b: '4' } : null));
  const r = V.aggregate(ids, dayMaps, { a: 100, b: 'x' });
  assert.deepEqual(r.a, { total: 100, today: 2, d7: 5, d30: 15 });
  // 累計キーが壊れていても日別の合計を下回らない
  assert.deepEqual(r.b, { total: 5, today: 0, d7: 1, d30: 5 });
});

test('isBotUserAgent: クローラー・自動操作・空は数えない。LINE 等のアプリ内ブラウザは数える', () => {
  for (const ua of ['', 'Googlebot/2.1', 'Mozilla/5.0 (compatible; bingbot/2.0)', 'facebookexternalhit/1.1', 'HeadlessChrome/120', 'curl/8.0', 'python-requests/2', 'WhatsApp/2.23.20']) {
    assert.equal(V.isBotUserAgent(ua), true, ua);
  }
  for (const ua of [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Line/13.0.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
  ]) assert.equal(V.isBotUserAgent(ua), false, ua);
});

test('isCountableId: 画面側の重複回避接尾辞（~2）や不正な形は数えない', () => {
  assert.equal(V.isCountableId('t-20261027-bcpen'), true);
  assert.equal(V.isCountableId('manual-tokyo-20261101-abc123'), true);
  assert.equal(V.isCountableId('t-20261027-bcpen~2'), false);
  assert.equal(V.isCountableId('../x'), false);
  assert.equal(V.isCountableId(''), false);
});

test('shouldSendView / pruneSeen: 同じタブで30分以内の再表示は送らない', () => {
  const now = 1_000_000_000;
  assert.equal(V.shouldSendView({}, 'a', now), true);
  assert.equal(V.shouldSendView({ a: now - 60_000 }, 'a', now), false, '再読み込み・戻る');
  assert.equal(V.shouldSendView({ a: now - V.CLIENT_DEDUP_MS - 1 }, 'a', now), true, '時間をおいた再訪問は数える');
  assert.deepEqual(V.pruneSeen({ a: now - 1000, b: now - V.CLIENT_DEDUP_MS - 1, c: 'x' }, now), { a: now - 1000 });
});

test('sortRows: 閲覧数は多い順、名前・日付は昇順。同点は開催日で安定', () => {
  const rows = [
    { id: '1', title: 'い', date: '2026-11-02', total: 5, d7: 3 },
    { id: '2', title: 'あ', date: '2026-11-01', total: 9, d7: 3 },
    { id: '3', title: 'う', date: '2026-10-01', total: 1, d7: 8 },
  ];
  assert.deepEqual(V.sortRows(rows, 'd7').map(r => r.id), ['3', '2', '1']);
  assert.deepEqual(V.sortRows(rows, 'total').map(r => r.id), ['2', '1', '3']);
  assert.deepEqual(V.sortRows(rows, 'title', 'asc').map(r => r.id), ['2', '1', '3']);
  assert.deepEqual(V.sortRows(rows, 'bogus').map(r => r.id), ['3', '2', '1'], '不正なキーは7日間');
});
