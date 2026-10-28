'use strict';
// OGP画像の文字列の無害化（shared/ogText.cjs）。satori の SVG エスケープ漏れ（GHSA-wx4j-mvgx-mqwp）の回避策。
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { ogSafeText } = require('./ogText.cjs');

test('SVG の構造を壊せる記号を全角に置き換える', () => {
  assert.strictEqual(ogSafeText('<text>"a" & \'b\'</text>', 60), '＜text＞＂a＂ ＆ ＇b＇＜/text＞');
  for (const ch of ['<', '>', '&', '"', "'"]) {
    assert.ok(!ogSafeText(`x${ch}y`, 60).includes(ch), `${ch} が残っている`);
  }
});

test('日本語のイベント名はそのまま', () => {
  const t = '令和8年度 自衛隊説明会（朝霞駐屯地）～見学あり～';
  assert.strictEqual(ogSafeText(t, 60), t);
});

test('制御文字・双方向制御・ゼロ幅文字を取り除く', () => {
  assert.strictEqual(ogSafeText('説明\u0000会‮​﻿\n', 60), '説明会');
});

test('文字数はコードポイント単位で切る（サロゲートペアを割らない）', () => {
  assert.strictEqual(ogSafeText('🎌🎌🎌', 2), '🎌🎌');
  assert.strictEqual(ogSafeText('あいうえお', 3), 'あいう');
});

test('null/undefined/数値も扱える', () => {
  assert.strictEqual(ogSafeText(undefined, 10), '');
  assert.strictEqual(ogSafeText(null, 10), '');
  assert.strictEqual(ogSafeText(2026, 10), '2026');
});

test('api/og.js はクエリの値をすべて ogSafeText に通している', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'api', 'og.js'), 'utf8');
  const gets = src.match(/searchParams\.get\(/g) || [];
  const safe = src.match(/ogSafeText\(searchParams\.get\(/g) || [];
  assert.ok(gets.length > 0, 'searchParams.get が見つからない');
  assert.strictEqual(safe.length, gets.length, 'ogSafeText を通していないクエリがある');
});
