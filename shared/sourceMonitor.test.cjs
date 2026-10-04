'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canonicalizeHtml,
  hashHtml,
  classifyChange,
} = require('../scraper/lib/sourceMonitor');

test('HTML監視はコメント・nonce・空白だけの差分を無視する', () => {
  const a = '<html>\n<!-- generated at 1 -->\n<body nonce="abc">イベント   情報</body></html>';
  const b = '<html><body nonce="xyz">イベント 情報</body></html>';
  assert.equal(canonicalizeHtml(a), canonicalizeHtml(b));
  assert.equal(hashHtml(a), hashHtml(b));
});

test('イベント本文やリンクの変更は更新として検知する', () => {
  const before = '<html><body><a href="/old.pdf">10月5日 説明会</a></body></html>';
  const after = '<html><body><a href="/new.pdf">10月6日 説明会</a></body></html>';
  assert.notEqual(hashHtml(before), hashHtml(after));
});

test('初回はbaseline、同一HTMLはunchanged、差分はchanged', () => {
  const current = { hash: hashHtml('<p>A</p>') };
  assert.equal(classifyChange(null, current), 'baseline');
  assert.equal(classifyChange({ hash: current.hash }, current), 'unchanged');
  assert.equal(classifyChange({ hash: hashHtml('<p>B</p>') }, current), 'changed');
});
