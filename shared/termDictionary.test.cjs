'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const D = require('./termDictionary.cjs');
const Q = require('./titleQuality.cjs');
const L = require('./llmExtract.cjs');

test('読み違いを直す（重なっていても直る）', () => {
  assert.equal(D.fixMisreadings('自衛隧説明会'), '自衛隊説明会');
  assert.equal(D.fixMisreadings('陵上自衛隧八尾駐屯地'), '陸上自衛隊八尾駐屯地');
  assert.equal(D.fixMisreadings('鞋屯地見学'), '駐屯地見学');
  assert.equal(D.fixMisreadings('今和8年度自衛官等探用案内'), '今和8年度自衛官等採用案内');
  assert.equal(D.fixMisreadings('合和8年度 体験搭秉'), '令和8年度 体験搭乗');
  assert.equal(D.fixMisreadings('自衛隊秋田地方協カ本部'), '自衛隊秋田地方協力本部');
});

test('正しい日本語を壊さない', () => {
  for (const t of ['合和さん（人名）', '自衛隊説明会', '陸上自衛隊 練馬駐屯地', '探検隊ツアー', 'カフェ協賛', '令和8年度']) {
    assert.equal(D.fixMisreadings(t), t, t);
  }
  assert.equal(D.fixMisreadings(null), null);
});

test('辞書の読み違いの組は、正しい側が日本語として自然（自己写像なし・重複なし）', () => {
  const wrongs = D.MISREADINGS.map(([w]) => w);
  assert.equal(new Set(wrongs).size, wrongs.length);
  for (const [w, r] of D.MISREADINGS) assert.notEqual(w, r);
});

test('カテゴリの決め方は固定9値だけを使う', () => {
  for (const [, c] of D.CATEGORY_RULES) assert.ok(L.CATEGORIES.includes(c), c);
});

test('LLM の指示（段1・段3）に独自辞書が入っている', () => {
  for (const p of [L.buildTextExtractPrompt({ prefLabel: '秋田' }), L.buildRecheckPrompt({})]) {
    assert.match(p, /【独自辞書】/);
    assert.match(p, /自衛隧→自衛隊/);
    assert.match(p, /title に含めないもの/);
    assert.match(p, /ファイル形式・サイズ/);
  }
});

test('イベント名の例は、整形ルールの結果と食い違わない', () => {
  for (const [src, out] of D.TITLE_EXAMPLES) {
    const c = Q.cleanEventTitle(src);
    if (out === null) assert.ok(!c || Q.isJunkOrStubTitle(c) || Q.isNonEventDocument({ title: c }), `${src} は除外されるべき（${c}）`);
  }
});

test('イベント名から「PDF」などの付記を取り除く', () => {
  const clean = (t) => Q.cleanEventTitle(t);
  assert.equal(clean('令和8年度 自衛隊説明会のご案内（PDF：600KB）'), '令和8年度 自衛隊説明会');
  assert.equal(clean('入間航空祭（PDF形式 1.2MB）'), '入間航空祭');
  assert.equal(clean('自衛隊説明会[PDF]'), '自衛隊説明会');
  assert.equal(clean('自衛隊説明会 [PDF'), '自衛隊説明会');
  assert.equal(clean('合同説明会(600KB)'), '合同説明会');
  assert.equal(clean('ブルーインパルス展示飛行(別ウィンドウで開きます)'), 'ブルーインパルス展示飛行');
  assert.equal(clean('［イベント］「美郷町フェスタ2026(美郷町)」に自衛隊ブース出展します'), '「美郷町フェスタ2026(美郷町)」に自衛隊ブース出展します');
  // 型番・正規の英字は残す
  assert.equal(clean('TC-90体験搭乗'), 'TC-90体験搭乗');
  assert.equal(clean('PDCAセミナー'), 'PDCAセミナー');
});

test('ファイルのダウンロード案内・採用案内の冊子はイベントにしない', () => {
  for (const t of ['自衛官等採用案内（令和8年度）[PDF', 'ダウンロード（PDF形式）', 'PDFをダウンロード令和8年度自衛官等採用案内(600KB)', '説明会資料ダウンロード', 'PDF', 'flyer2026.pdf']) {
    assert.ok(Q.isJunkOrStubTitle(Q.cleanEventTitle(t)), t);
  }
  // イベントは残す
  for (const t of ['自衛隊説明会', '採用説明会のご案内', '入間航空祭']) assert.ok(!Q.isJunkOrStubTitle(Q.cleanEventTitle(t)), t);
});
