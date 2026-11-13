'use strict';
/**
 * 旧ドメイン → .jp の自動移動と設定の引き継ぎのテスト（shared/domainMigration.cjs）
 *
 * 旧ドメインで配信するスクリプトは文字列なので、仮の localStorage・location の上で実際に実行し、
 * .jp 側の decodePayload / planImport で読めることを確かめる（片方だけ直してズレる事故を防ぐ）。
 */
const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const { readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');

const m = require('./domainMigration.cjs');
const { decideDomainNotice } = require('./domainNotice.cjs');

const ORIGIN = 'https://jsdf-chiiki-events.jp';
const root = join(__dirname, '..');

/** 旧ドメインの引っ越し用スクリプトを仮の環境で動かし、移動先の URL を返す */
function runLegacyScript(store, href = 'https://jsdf-chiiki-events.vercel.app/list?pref=tokyo') {
  const loc = new URL(href);
  let replaced = null;
  const window = {
    localStorage: { getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null) },
    location: { pathname: loc.pathname, search: loc.search, replace: (u) => { replaced = u; } },
  };
  vm.runInNewContext(m.legacyMigrateScriptSource(ORIGIN), {
    window, URL, btoa, unescape, encodeURIComponent, JSON, Object,
  });
  return replaced;
}

test('旧ドメインのスクリプトが載せた設定を .jp 側で読める（パス・クエリも保つ）', () => {
  const store = {
    'jsdf-favorites': JSON.stringify(['ev-1', 'ev-2']),
    'jsdf-scheme': 'maritime',
    'jsdf-dark': 'dark',
    'jsdf-legal-accepted': '2026-10-15',      // 運ばない
    'jsdf-events-cache': '{"events":[]}',     // 運ばない
    'jsdf-admin-account': '{"user":"x"}',     // 運ばない
  };
  const url = runLegacyScript(store);
  assert.ok(url.startsWith(`${ORIGIN}/list?pref=tokyo#jsdf-migrate=`), url);
  const payload = m.payloadFromHash(new URL(url).hash);
  assert.deepStrictEqual(payload.items, {
    'jsdf-favorites': JSON.stringify(['ev-1', 'ev-2']),
    'jsdf-scheme': 'maritime',
    'jsdf-dark': 'dark',
  });
});

test('設定が何も無ければ # を付けずに移る', () => {
  const url = runLegacyScript({});
  assert.strictEqual(url, `${ORIGIN}/list?pref=tokyo`);
});

test('日本語を含む値（通知履歴）も壊れずに運べる', () => {
  const hist = JSON.stringify([{ id: 'a', title: '入間航空祭', at: '2026-11-03' }]);
  const url = runLegacyScript({ 'jsdf-notif-history': hist });
  assert.strictEqual(m.payloadFromHash(new URL(url).hash).items['jsdf-notif-history'], hist);
});

test('上限を超えたら優先度の低い項目（通知履歴）から落とし、お気に入りは残す', () => {
  const big = JSON.stringify(Array.from({ length: 200 }, (_, i) => ({ id: `n${i}`, title: 'あ'.repeat(200) })));
  const store = { 'jsdf-favorites': JSON.stringify(['ev-1']), 'jsdf-notif-history': big };
  const url = runLegacyScript(store);
  const hash = new URL(url).hash;
  assert.ok(hash.length <= m.MAX_PAYLOAD_CHARS + 40);
  const items = m.payloadFromHash(hash).items;
  assert.strictEqual(items['jsdf-favorites'], JSON.stringify(['ev-1']));
  assert.ok(!('jsdf-notif-history' in items));
  // encodePayload（.jp 側の実装）も同じ順で落とす
  assert.ok(!('jsdf-notif-history' in m.decodePayload(m.encodePayload(store)).items));
});

test('形の違う値・未知の項目は読み込まない', () => {
  const evil = m.encodePayload({}) || '';
  assert.strictEqual(evil, '');
  const raw = Buffer.from(JSON.stringify({ v: 1, items: {
    'jsdf-scheme': '<img src=x onerror=alert(1)>',
    'jsdf-favorites': JSON.stringify([1, 2]),
    'jsdf-legal-accepted': '2026-10-15',
    'jsdf-admin-account': '{"user":"x"}',
    'jsdf-dark': 'light',
  } })).toString('base64url');
  assert.deepStrictEqual(m.decodePayload(raw).items, { 'jsdf-dark': 'light' });
  assert.strictEqual(m.decodePayload('壊れた値'), null);
  assert.strictEqual(m.decodePayload(Buffer.from('{"v":2,"items":{}}').toString('base64url')), null);
  assert.strictEqual(m.payloadFromHash('#other=1'), null);
});

test('planImport: 既にある設定は上書きしない・お気に入りは和集合', () => {
  const payload = { items: {
    'jsdf-favorites': JSON.stringify(['a', 'b']),
    'jsdf-applied': JSON.stringify(['x']),
    'jsdf-scheme': 'air',
    'jsdf-dark': 'dark',
  } };
  const existing = { 'jsdf-favorites': JSON.stringify(['b', 'c']), 'jsdf-scheme': 'ground' };
  const plan = Object.fromEntries(m.planImport(payload, (k) => existing[k] ?? null));
  assert.deepStrictEqual(JSON.parse(plan['jsdf-favorites']).sort(), ['a', 'b', 'c']);
  assert.strictEqual(plan['jsdf-applied'], JSON.stringify(['x']));
  assert.strictEqual(plan['jsdf-dark'], 'dark');
  assert.ok(!('jsdf-scheme' in plan), '既にある配色は上書きしない');
  // 和集合で増えないなら書き込まない
  const same = m.planImport({ items: { 'jsdf-favorites': JSON.stringify(['b']) } }, (k) => existing[k] ?? null);
  assert.deepStrictEqual(same, []);
});

test('hash の後始末: 引き継ぎだけを消し、他の値は残す', () => {
  assert.strictEqual(m.hashWithoutPayload('#jsdf-migrate=abc'), '');
  assert.strictEqual(m.hashWithoutPayload('#jsdf-migrate=abc&x=1'), '#x=1');
});

test('移動先は .jp の中だけ（外部・プロトコル相対へは飛ばさない）', () => {
  assert.strictEqual(m.migrateTargetUrl('/event/abc?x=1'), `${ORIGIN}/event/abc?x=1`);
  assert.strictEqual(m.migrateTargetUrl('//evil.example/'), `${ORIGIN}/`);
  assert.strictEqual(m.migrateTargetUrl('https://evil.example/'), `${ORIGIN}/`);
  assert.strictEqual(runLegacyScript({}, 'https://jsdf-chiiki-events.vercel.app//evil.example/x'), `${ORIGIN}/`);
});

test('旧ドメインの返し方: 遷移だけ引っ越し用ページ、検索エンジン等は 308', () => {
  const k = (o) => m.legacyResponseKind({ method: 'GET', ...o });
  assert.strictEqual(k({ pathname: '/sw.js' }), 'sw');
  assert.strictEqual(k({ pathname: '/__migrate.js' }), 'script');
  assert.strictEqual(k({ pathname: '/list', secFetchDest: 'document', secFetchMode: 'navigate' }), 'page');
  assert.strictEqual(k({ pathname: '/list' }), 'redirect');                       // ヘッダーなし（クローラ）
  assert.strictEqual(k({ pathname: '/data/events.json', secFetchDest: 'empty', secFetchMode: 'cors' }), 'redirect');
  assert.strictEqual(k({ pathname: '/list', method: 'POST', secFetchDest: 'document', secFetchMode: 'navigate' }), 'redirect');
});

test('片付け用 SW: キャッシュを消し、登録を外し、開いている画面を読み直す', async () => {
  const handlers = {};
  const calls = [];
  const self = {
    addEventListener: (t, fn) => { handlers[t] = fn; },
    skipWaiting: () => calls.push('skipWaiting'),
    clients: {
      claim: async () => calls.push('claim'),
      matchAll: async () => [{ url: 'https://jsdf-chiiki-events.vercel.app/list', navigate: async (u) => calls.push(`navigate:${u}`) }],
    },
    registration: { unregister: async () => calls.push('unregister') },
  };
  const caches = { keys: async () => ['workbox-precache', 'events'], delete: async (n) => calls.push(`delete:${n}`) };
  vm.runInNewContext(m.legacyServiceWorkerSource(), { self, caches, Promise });
  handlers.install();
  let done;
  handlers.activate({ waitUntil: (p) => { done = p; } });
  await done;
  assert.deepStrictEqual(calls, [
    'skipWaiting', 'claim', 'delete:workbox-precache', 'delete:events', 'unregister',
    'navigate:https://jsdf-chiiki-events.vercel.app/list',
  ]);
  assert.ok(!/addEventListener\('fetch'/.test(m.legacyServiceWorkerSource()), 'fetch を横取りしない（読み直しをサーバーへ通す）');
});

test('引っ越し用ページ: 外部スクリプトを読み、noindex・リンクの予備がある', () => {
  const html = m.legacyMigratePageHtml('/event/a"b<c>', ORIGIN);
  assert.match(html, /<script src="\/__migrate\.js"><\/script>/);
  assert.match(html, /noindex/);
  assert.ok(!/<script>[^<]/.test(html), 'インラインスクリプトは CSP で止まるため使わない');
  assert.ok(!html.includes('a"b<c>'), '値はエスケープする');
});

test('middleware: 旧ドメインは種類ごとに返し方を変え、プレビューは転送しない', async () => {
  const mw = await import('../middleware.js');
  const req = (url, headers = {}) => new Request(url, { headers });
  const legacy = 'https://jsdf-chiiki-events.vercel.app';

  const page = await mw.default(req(`${legacy}/list?pref=tokyo`, { 'sec-fetch-dest': 'document', 'sec-fetch-mode': 'navigate' }));
  assert.strictEqual(page.status, 200);
  assert.match(await page.text(), /__migrate\.js/);

  const bot = await mw.default(req(`${legacy}/list?pref=tokyo`));
  assert.strictEqual(bot.status, 308);
  assert.strictEqual(bot.headers.get('location'), `${ORIGIN}/list?pref=tokyo`);

  const sw = await mw.default(req(`${legacy}/sw.js`, { 'sec-fetch-dest': 'serviceworker' }));
  assert.strictEqual(sw.status, 200);
  assert.match(sw.headers.get('content-type'), /javascript/);
  assert.match(sw.headers.get('cache-control'), /no-store/);

  const script = await mw.default(req(`${legacy}/__migrate.js`, { 'sec-fetch-dest': 'script' }));
  assert.match(await script.text(), /jsdf-migrate/);

  assert.ok(mw.isLegacyProductionHost('jsdf-chiiki-events.vercel.app', {}));
  assert.ok(mw.isLegacyProductionHost('jsdf-chiiki-events-abc123-team.vercel.app', { VERCEL_ENV: 'production' }));
  assert.ok(!mw.isLegacyProductionHost('jsdf-chiiki-events-git-feat-team.vercel.app', { VERCEL_ENV: 'preview' }));
  assert.ok(!mw.isLegacyProductionHost('jsdf-chiiki-events.jp', { VERCEL_ENV: 'production' }));
});

test('お知らせ: 引き継いで移ってきた人には「引き継ぎました」の文面', () => {
  const host = 'jsdf-chiiki-events.jp';
  assert.strictEqual(decideDomainNotice({ host, today: '2026-11-13', migrated: true }).mode, 'migrated-here');
  assert.strictEqual(decideDomainNotice({ host, today: '2026-11-13' }).mode, 'moved-here');
});

test('引き継ぐ項目は実際に画面が使っているキーで、運んではいけないものを含まない', () => {
  const src = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(jsx?|cjs)$/.test(e.name)) src.push(readFileSync(p, 'utf8'));
    }
  };
  walk(join(root, 'src'));
  const all = src.join('\n');
  for (const { key } of m.CARRY_KEYS) {
    assert.ok(all.includes(`'${key}'`), `${key} が src で使われていない（名前が変わった？）`);
  }
  const keys = m.CARRY_KEYS.map((c) => c.key);
  // 新しい保存項目を作らない（作るとプライバシーポリシーの改定・再同意が要る）
  const imp = readFileSync(join(root, 'src/utils/domainMigrationImport.js'), 'utf8');
  assert.ok(!/setItem\((?!k, v\))/.test(imp), 'domainMigrationImport.js は引き継ぐ値以外を保存しない');
  for (const ng of ['jsdf-legal-accepted', 'jsdf-events-cache', 'jsdf-admin-account', 'jsdf-watch-favorites', 'jsdf-domain-notice']) {
    assert.ok(!keys.includes(ng), `${ng} は引き継がない`);
  }
});

test('main.jsx: 受け取り処理は最初の import（アクセス解析より前）', () => {
  const main = readFileSync(join(root, 'src/main.jsx'), 'utf8');
  const firstImport = main.split('\n').find((l) => /^import /.test(l));
  assert.match(firstImport, /domainMigrationImport/);
});
