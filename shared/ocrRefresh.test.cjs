'use strict';
/**
 * scraper/lib/ocrRefresh.js のテスト
 *
 * 旧ローカルOCR（中国語モデル）の誤読をキャッシュから読み直す判定。
 * 読み直しすぎると LLM 整形の呼び出しが一斉に増え、読み直さなければ誤読が 90 日公開され続ける。
 */
const test   = require('node:test');
const assert = require('node:assert/strict');
const { OCR_PIPELINE_VERSION, hasChineseTrace, looksMisread, needsLocalReocr } = require('../scraper/lib/ocrRefresh');

test('hasChineseTrace: 日本語で使わない簡体字の痕跡を検出する', () => {
  assert.equal(hasChineseTrace('役場北驻車場/保健七久一'), true);   // 驻（駐）
  assert.equal(hasChineseTrace('宇都宫鞋屯地学'), true);           // 宫（宮）
  assert.equal(hasChineseTrace('宇都宮駐屯地見学'), false);
  assert.equal(hasChineseTrace('第58回 長野原町文化祭'), false);
  assert.equal(hasChineseTrace(''), false);
  assert.equal(hasChineseTrace(null), false);
});

test('looksMisread: タイトル・会場の誤読の疑い', () => {
  assert.equal(looksMisread({ title: '役場北驻車場/保健七久一' }), true);
  assert.equal(looksMisread({ title: '自衛隊説明会', place: '西東京地域事务所' }), true);   // 会場に簡体字
  assert.equal(looksMisread({ title: '2 受付時間 07:30～08:20' }), true);                 // 様式行
  assert.equal(looksMisread({ title: '宇都宮駐屯地見学', place: '宇都宮駐屯地' }), false);
  // タイトル欠落だけでは読み直さない（直る見込みが薄く、件数が膨らむ）
  assert.equal(looksMisread({ title: null, date: '令和8年10月1日' }), false);
  assert.equal(looksMisread(null), false);
});

test('needsLocalReocr: 旧パイプラインの誤読だけを1回だけ読み直す', () => {
  const legacyBad = { result: { title: '役場北驻車場/保健七久一' } };
  assert.equal(needsLocalReocr(legacyBad), true);
  // 新パイプラインの結果は対象外
  assert.equal(needsLocalReocr({ ...legacyBad, ocr_pipeline: OCR_PIPELINE_VERSION }), false);
  // 一度読み直した（改善しなかった）ものは繰り返さない
  assert.equal(needsLocalReocr({ ...legacyBad, refreshed_for: OCR_PIPELINE_VERSION }), false);
  // 誤読の痕跡が無い旧結果は対象外（API で読んだ良い結果を落とさない）
  assert.equal(needsLocalReocr({ result: { title: '宇都宮駐屯地見学' } }), false);
  // 複数イベント（配列）の結果は置き換えると件数が減るので対象外
  assert.equal(needsLocalReocr({ result: [{ title: '役場北驻車場' }, { title: 'B' }] }), false);
  assert.equal(needsLocalReocr(null), false);
  assert.equal(needsLocalReocr({ ocr_status: 'success' }), false);
});
