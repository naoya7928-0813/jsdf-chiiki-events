'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { validateEventsData, uniquifyIds } = require('./dataQuality.cjs');

// 妥当な最小イベント
const ev = (over = {}) => ({
  id: 'tokyo-1', pref: 'tokyo', date: '2026-07-01', title: '自衛隊音楽まつり',
  place: '日本武道館', weatherLocation: { latitude: 35.6, longitude: 139.7, accuracy: 'address' },
  ...over,
});
const data = (events, key = 'tokyo') => ({ [key]: events, updatedAt: '2026-06-28' });
const hasErr = (res, re) => res.errors.some(e => re.test(e));

test('正常データはエラーなし', () => {
  const res = validateEventsData(data([ev()]));
  assert.equal(res.errors.length, 0);
  assert.equal(res.total, 1);
});
test('id 重複はエラー', () => {
  const res = validateEventsData(data([ev(), ev({ date: '2026-07-02' })]));
  assert.ok(hasErr(res, /id 重複/));
});
test('pref とキー不一致はエラー', () => {
  const res = validateEventsData(data([ev({ pref: 'osaka' })], 'tokyo'));
  assert.ok(hasErr(res, /不一致/));
});
test('不正な日付・実在しない日付はエラー', () => {
  assert.ok(hasErr(validateEventsData(data([ev({ date: '2026/07/01' })])), /date の形式/));
  assert.ok(hasErr(validateEventsData(data([ev({ date: '2026-02-30' })])), /実在しない日付/));
});
test('endDate < date はエラー', () => {
  assert.ok(hasErr(validateEventsData(data([ev({ endDate: '2026-06-30' })])), /endDate/));
});
test('タイトル空はエラー', () => {
  assert.ok(hasErr(validateEventsData(data([ev({ title: '' })])), /タイトルが空/));
});
test('weatherLocation の座標範囲外・不正 accuracy はエラー', () => {
  assert.ok(hasErr(validateEventsData(data([ev({ weatherLocation: { latitude: 0, longitude: 0, accuracy: 'address' } })])), /座標が範囲外/));
  assert.ok(hasErr(validateEventsData(data([ev({ weatherLocation: { latitude: 35.6, longitude: 139.7, accuracy: 'city' } })])), /accuracy が不正/));
});
test('スクレイプデータに manual- IDが混入したらエラー', () => {
  assert.ok(hasErr(validateEventsData(data([ev({ id: 'manual-tokyo-1' })])), /手動イベントID/));
});
test('手動イベントとのID衝突はエラー', () => {
  const res = validateEventsData(data([ev({ id: 'dup-1' })]), { manualIds: new Set(['dup-1']) });
  assert.ok(hasErr(res, /ID衝突/));
});
test('構造破損（配列でない）はエラー', () => {
  assert.ok(hasErr(validateEventsData({ tokyo: { not: 'array' } }), /配列ではありません/));
  assert.ok(validateEventsData(null).errors.length > 0);
});
test('不明な地本キーはエラー', () => {
  assert.ok(hasErr(validateEventsData(data([ev({ pref: 'atlantis' })], 'atlantis')), /不明な地本キー/));
});
test('総数の異常減少はエラー', () => {
  const res = validateEventsData(data([ev()]), { prevTotal: 100 });
  assert.ok(hasErr(res, /異常に減少/));
});
test('正常なイベントは警告のみ（除外しない）', () => {
  const res = validateEventsData(data([ev()]));
  assert.equal(res.errors.length, 0);
});
test('uniquifyIds: 衝突IDに接尾辞を付け、検証が通る', () => {
  const d = data([ev({ id: 'dup', title: 'A' }), ev({ id: 'dup', date: '2026-07-02', title: 'B' })]);
  const n = uniquifyIds(d);
  assert.equal(n, 1);
  const ids = d.tokyo.map(e => e.id);
  assert.deepEqual(ids, ['dup', 'dup-2']);
  assert.equal(validateEventsData(d).errors.length, 0); // 一意化後はID重複エラーなし
});

test('極端に長いタイトル・会場欠落は警告', () => {
  const res = validateEventsData(data([ev({ title: 'あ'.repeat(90), place: '' })]));
  assert.equal(res.errors.length, 0);
  assert.ok(res.warnings.some(w => /極端に長い/.test(w)));
  assert.ok(res.warnings.some(w => /会場情報/.test(w)));
});
