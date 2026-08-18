'use strict';
/**
 * scraper/lib/ocrDate.js のテスト（npm test の shared/*.test.cjs glob で実行）
 *
 * 2026-08 の障害の再発防止:
 *   OCR テキストの日付抽出が「YYYY年M月D日（曜）」必須だったため、
 *   ローカル OCR の出力をほぼ全て取りこぼし構造化成功が 0 件になっていた。
 *   実チラシに現れる表記を固定して、緩めすぎ（誤検出）も同時に防ぐ。
 */
const test   = require('node:test');
const assert = require('node:assert/strict');
const {
  extractDateParts, parseDateFromText, resolveDateParts, toJpDateString, normalizeWeekday, resolveYear,
} = require('../scraper/lib/ocrDate');

// 全テストの基準日を固定する（2026-08-18 は火曜日）
const NOW = new Date('2026-08-18T00:00:00Z');
const at  = (text) => parseDateFromText(text, { now: NOW });

test('曜日カッコ付きの従来表記は引き続き解釈できる', () => {
  assert.deepEqual(at('令和8年8月22日（土）自衛隊フェア'), { dateStr: '2026-08-22', weekday: '土' });
  assert.deepEqual(at('2026年8月22日（土）'),               { dateStr: '2026-08-22', weekday: '土' });
  assert.deepEqual(at('8月22日（土）開催'),                 { dateStr: '2026-08-22', weekday: '土' });
});

test('曜日が無い表記も解釈できる（今回の本丸）', () => {
  assert.deepEqual(at('2026年8月22日'), { dateStr: '2026-08-22', weekday: '土' });
  assert.deepEqual(at('8月22日'),       { dateStr: '2026-08-22', weekday: '土' });
  assert.deepEqual(at('令和8年9月5日'), { dateStr: '2026-09-05', weekday: '土' });
});

test('区切り記号の表記（2026/8/22・2026.8.22・2026-08-22）', () => {
  assert.deepEqual(at('2026/8/22'),      { dateStr: '2026-08-22', weekday: '土' });
  assert.deepEqual(at('2026.8.22'),      { dateStr: '2026-08-22', weekday: '土' });
  assert.deepEqual(at('2026-08-22'),     { dateStr: '2026-08-22', weekday: '土' });
  assert.deepEqual(at('2026/8/22（土）'), { dateStr: '2026-08-22', weekday: '土' });
});

test('年なしスラッシュ表記は曜日か日付ラベルがある時だけ採用する', () => {
  assert.deepEqual(at('8/22（土）'),   { dateStr: '2026-08-22', weekday: '土' });
  assert.deepEqual(at('日時 8/22'),    { dateStr: '2026-08-22', weekday: '土' });
  assert.deepEqual(at('開催日 8/22'),  { dateStr: '2026-08-22', weekday: '土' });
  // 手がかりが無ければ日付とみなさない（分数・比率・整理番号の誤検出防止）
  assert.equal(at('募集人数は 1/2 程度'), null);
  assert.equal(at('倍率 3/4'),            null);
});

test('全角数字・空白のゆれを吸収する', () => {
  assert.deepEqual(at('２０２６年８月２２日（土）'), { dateStr: '2026-08-22', weekday: '土' });
  assert.deepEqual(at('8 月 22 日 （ 土 ）'),        { dateStr: '2026-08-22', weekday: '土' });
});

test('全角区切り（／．－）の日付も拾う', () => {
  assert.deepEqual(at('２０２６／８／２２'), { dateStr: '2026-08-22', weekday: '土' });
  assert.deepEqual(at('2026．8．22'),        { dateStr: '2026-08-22', weekday: '土' });
  assert.deepEqual(at('2026－08－22'),       { dateStr: '2026-08-22', weekday: '土' });
  assert.deepEqual(at('8／22（土）'),        { dateStr: '2026-08-22', weekday: '土' });
  assert.deepEqual(at('日時：8／22'),        { dateStr: '2026-08-22', weekday: '土' });
});

test('年なしドット区切りも曜日・ラベルがあれば拾う', () => {
  assert.deepEqual(at('8.22（土）'),  { dateStr: '2026-08-22', weekday: '土' });
  assert.deepEqual(at('開催日 8.22'), { dateStr: '2026-08-22', weekday: '土' });
  assert.equal(at('倍率は 1.25 です'), null);   // 小数は日付ではない
});

test('数字が続く並びを日付と誤認しない', () => {
  assert.equal(at('整理番号 8/222'),   null);
  assert.equal(at('日時 8/22/33'),     null);
  assert.equal(at('バージョン 1.2.3'), null);
});

test('複数日表記は先頭の曜日を採用する', () => {
  assert.deepEqual(at('8月22日（土・日）'), { dateStr: '2026-08-22', weekday: '土' });
  assert.equal(normalizeWeekday('土・日'), '土');
  assert.equal(normalizeWeekday('祝'),     '');
});

test('年なしで既に過ぎた月日は翌年として解釈する', () => {
  // 基準日 2026-08-18 に対して 1月10日 → 2027-01-10
  assert.deepEqual(at('1月10日'), { dateStr: '2027-01-10', weekday: '日' });
});

test('曜日が暦と矛盾する場合は日付を確定しない（古いチラシ・OCR誤読）', () => {
  // 2026-08-22 は土曜。月曜と書かれていれば現在年・翌年とも一致せず確定不可
  assert.equal(at('8月22日（月）'), null);
});

test('曜日はOCRの記載ではなく暦から引き直す', () => {
  // 2026-08-22 は土曜。西暦つきなら曜日欄が無くても正しい曜日が入る
  assert.equal(at('2026年8月22日').weekday, '土');
});

test('過去日は既定で除外し、allowPast で取得できる', () => {
  assert.equal(at('2026年8月1日'), null);
  const parts = extractDateParts('2026年8月1日');
  assert.deepEqual(resolveDateParts(parts, { now: NOW, allowPast: true }),
    { dateStr: '2026-08-01', weekday: '土' });
});

test('実在しない日付は弾く', () => {
  assert.equal(at('2026年2月30日'), null);
  assert.equal(at('2026年13月1日'), null);
});

test('時刻や電話番号を日付と誤認しない', () => {
  assert.equal(at('受付 10:00～16:00'),        null);
  assert.equal(at('お問合せ 03-1234-5678'),    null);
  assert.equal(at('第25普通科連隊'),            null);
});

test('文中から最初の日付を拾う（本文まるごと投入を想定）', () => {
  const text = [
    '自衛隊フェア2026',
    '日時：8月22日（土）10:00～16:00',
    '場所：〇〇駐屯地',
  ].join('\n');
  assert.deepEqual(at(text), { dateStr: '2026-08-22', weekday: '土' });
});

test('resolveYear: 曜日ありは曜日一致年、曜日なしは直近の将来', () => {
  assert.equal(resolveYear(8, 22, '土', NOW), 2026);
  assert.equal(resolveYear(8, 22, '月', NOW), null);
  assert.equal(resolveYear(1, 10, '',   NOW), 2027);
  // 直近7日以内の過去は今年扱い（当日〜数日前のチラシを落とさない）
  assert.equal(resolveYear(8, 14, '',   NOW), 2026);
});

test('曜日なし・年なしで半年以上先になる月日は確定しない（終了済みチラシ対策）', () => {
  // 基準日 2026-08-18 の「8月1日」。今年なら 17 日前、翌年なら 348 日先。
  // どちらも採らない＝1年後の架空イベントを作らない。
  assert.equal(resolveYear(8, 1, '', NOW), null);
  assert.equal(at('8月1日'), null);
  // 曜日があれば暦で確定できるので採用する（2027-08-01 は日曜）
  assert.deepEqual(at('8月1日（日）'), { dateStr: '2027-08-01', weekday: '日' });
});

test('toJpDateString: 内部受け渡し用の表記に戻せる', () => {
  assert.equal(toJpDateString({ dateStr: '2026-08-22', weekday: '土' }), '2026年8月22日（土）');
  assert.equal(toJpDateString({ dateStr: '2026-08-22' }),                '2026年8月22日（土）');
});

test('往復変換: 生成した表記を再パースしても同じ日付になる', () => {
  const first = at('8月22日（土）');
  const round = parseDateFromText(toJpDateString(first), { now: NOW });
  assert.deepEqual(round, first);
});
