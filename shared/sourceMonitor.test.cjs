'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canonicalizeHtml,
  hashHtml,
  classifyChange,
} = require('../scraper/lib/sourceMonitor');
const { loadSources, takeSnapshot } = require('../scraper/check-source-updates');

test('全ての明示的巡回先を週次監視に含め、共通URLは重複取得しない', () => {
  const registry = require('../scraper/config/office-event-sources.json');
  const sources = loadSources();
  const urls = sources.map(s => s.normalizedUrl);
  assert.equal(new Set(urls).size, urls.length);
  for (const office of registry.offices) {
    for (const url of [office.contactUrl, ...office.pages.map(p => p.url)]) {
      const normalized = new URL(url); normalized.hash = '';
      assert.ok(urls.includes(normalized.href), `${office.id}: ${url}`);
    }
  }
});

test('DOM取得競合は受信済みHTMLで回復し、追加取得しない', async () => {
  let requests = 0; let closed = false;
  const html = '<html><body>新しい募集説明会のお知らせです。</body></html>';
  const response = { status: () => 200, allHeaders: async () => ({}),
    body: async () => Buffer.from(html), url: () => 'https://www.mod.go.jp/pco/miyagi/' };
  const page = { goto: async () => { requests++; return response; },
    content: async () => { throw Error('navigation'); }, close: async () => { closed = true; } };
  const snapshot = await takeSnapshot({ newPage: async () => page }, { url: response.url() });
  assert.equal(snapshot.hash, hashHtml(html));
  assert.equal(snapshot.status, 200);
  assert.equal(requests, 1);
  assert.equal(closed, true);
});

test('403はHTML回復を試みず保護停止として扱う', async () => {
  let readBody = false;
  const page = { goto: async () => ({ status: () => 403, body: async () => { readBody = true; } }),
    close: async () => {} };
  await assert.rejects(takeSnapshot({ newPage: async () => page }, { url: 'https://www.mod.go.jp/pco/miyagi/' }),
    error => error.hardBlock === true);
  assert.equal(readBody, false);
});

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
