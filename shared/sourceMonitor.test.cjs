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
  const { HASH_VERSION } = require('../scraper/lib/sourceMonitor');
  const current = { hash: hashHtml('<p>A</p>'), hashVersion: HASH_VERSION };
  assert.equal(classifyChange(null, current), 'baseline');
  assert.equal(classifyChange({ hash: current.hash, hashVersion: HASH_VERSION }, current), 'unchanged');
  assert.equal(classifyChange({ hash: hashHtml('<p>B</p>'), hashVersion: HASH_VERSION }, current), 'changed');
  // 比べ方の版が変わった直後は基準値の作り直し（全ページ「更新あり」でフルスクレイプを起動しない）
  assert.equal(classifyChange({ hash: 'old-format' }, current), 'baseline');
});

test('毎回変わる埋め込み（スクリプトのトークン・head の link/meta・配信基盤の参照）だけの差は更新にしない', () => {
  const page = (token, ver) => `<html><head><title>イベント</title><meta name="csrf" content="${token}">
    <link rel="stylesheet" href="/style.css?ver=${ver}"><script>window.__CF$cv$params={r:'${token}',t:'${ver}'};</script></head>
    <body><script nonce="${token}">var x='${token}';</script><img src="/cdn-cgi/beacon?${token}">
    <h2>12月6日 説明会</h2><a href="/flyer.pdf">チラシ</a><noscript>${token}</noscript></body></html>`;
  assert.equal(hashHtml(page('aaa', 1)), hashHtml(page('bbb', 2)));
});

test('チラシの差し替え・日付の変更・画像の差し替えは更新として検知する', () => {
  const base = '<body><h2>12月6日 説明会</h2><a href="/flyer.pdf">チラシ</a><img src="/a.jpg"></body>';
  assert.notEqual(hashHtml(base), hashHtml(base.replace('/flyer.pdf', '/flyer2.pdf')));
  assert.notEqual(hashHtml(base), hashHtml(base.replace('12月6日', '12月7日')));
  assert.notEqual(hashHtml(base), hashHtml(base.replace('/a.jpg', '/b.jpg')));
});

test('スクリプト内のイベントデータ（広島の calendarEvents）の変更は検知し、他のスクリプトの変化は無視する', () => {
  const { hashHtml: h } = require('../scraper/lib/sourceMonitor');
  const page = (cal, token) => `<html><body><h1>イベント</h1>
    <script>var calendarEvents = ${cal};</script>
    <script>window.__token="${token}";</script></body></html>`;
  const a = '[{"title":"自衛隊説明会","start":"2026-12-05 10:00:00","url":"https://example.jp/a"}]';
  const b = '[{"title":"自衛隊説明会","start":"2026-12-06 10:00:00","url":"https://example.jp/a"}]';
  assert.equal(h(page(a, 'x1')), h(page(a, 'y2')), '関係ないスクリプトの変化は無視する');
  assert.notEqual(h(page(a, 'x1')), h(page(b, 'x1')), 'カレンダーの日付の変更は検知する');
});

test('監視で残すスクリプトのデータは、パーサーが読むものと同じ形', () => {
  const { EVENT_SCRIPT_PATTERNS } = require('../scraper/lib/sourceMonitor');
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../scraper/parsers/hiroshima.js'), 'utf8');
  assert.ok(src.includes(EVENT_SCRIPT_PATTERNS[0].source), 'hiroshima.js の calendarEvents の読み方と揃える');
});
