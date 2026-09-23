'use strict';
// shared/parserHealth.cjs のテスト（パーサーの「0件＝成功」を疑う判定）
const test = require('node:test');
const assert = require('node:assert/strict');
const { countFutureDateMarkers, assessParseResult } = require('./parserHealth.cjs');

test('countFutureDateMarkers: 令和・西暦・月日（全角も）の今日以降の日付を重複なく数える', () => {
  const text = '【日時】令和８年９月２６日（土） ／ 2026年10月3日 ／ 10月3日（土） ／ 2026/10/10';
  assert.equal(countFutureDateMarkers(text, '2026-09-23'), 3); // 9/26・10/3・10/10（10/3 は重複）
});

test('countFutureDateMarkers: 過去の日付は数えない（開催済みの実績一覧で誤検知しない）', () => {
  assert.equal(countFutureDateMarkers('令和８年９月１日（火）、2026年8月30日、9月20日', '2026-09-23'), 0);
});

test('countFutureDateMarkers: 年の無い月日は、今年が過去なら翌年とみなす', () => {
  assert.equal(countFutureDateMarkers('1月10日 と 2月3日', '2026-12-01'), 2);
});

test('assessParseResult: 今日以降の日付が2件以上あるのに0件ならパーサー失敗', () => {
  const text = '令和８年９月２６日（土） 富士急ハイランド 令和８年１０月３日（土）';
  assert.equal(assessParseResult({ text, eventCount: 0, today: '2026-09-23' }).ok, false);
  assert.equal(assessParseResult({ text, eventCount: 2, today: '2026-09-23' }).ok, true);
  assert.equal(assessParseResult({ text: '準備中', eventCount: 0, today: '2026-09-23' }).ok, true); // 本当に掲載が無い
  assert.equal(assessParseResult({ text: '令和８年９月２６日のみ', eventCount: 0, today: '2026-09-23' }).ok, true); // 1件は判定しない
});
