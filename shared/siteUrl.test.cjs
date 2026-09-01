const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const S = require('./siteUrl.cjs');

const root = f => path.join(__dirname, '..', f);

test('siteUrl: SITE_URL 未設定なら現行の公開URL', () => {
  assert.strictEqual(S.siteUrl({}), S.DEFAULT_SITE_URL);
});

test('siteUrl: SITE_URL を設定すると切り替わる（末尾スラッシュ・パスは落とす）', () => {
  assert.strictEqual(S.siteUrl({ SITE_URL: 'https://example.jp/' }), 'https://example.jp');
  assert.strictEqual(S.siteUrl({ SITE_URL: 'https://example.jp/foo?a=1' }), 'https://example.jp');
  assert.strictEqual(S.siteHost({ SITE_URL: 'https://www.example.jp' }), 'www.example.jp');
});

test('siteUrl: 不正な値は無視して既定に落ちる（設定ミスで壊さない）', () => {
  for (const bad of ['', '  ', 'example.jp', 'javascript:alert(1)', 'ftp://example.jp', null, undefined]) {
    assert.strictEqual(S.siteUrl({ SITE_URL: bad }), S.DEFAULT_SITE_URL, `SITE_URL=${bad}`);
  }
});

test('allowedOrigins: 新ドメイン・SITE_ORIGINS・旧ドメインを含み、重複しない', () => {
  const list = S.allowedOrigins(
    { SITE_URL: 'https://example.jp', SITE_ORIGINS: 'https://www.example.jp, https://example.jp' },
    false,
  );
  assert.ok(list.includes('https://example.jp'));
  assert.ok(list.includes('https://www.example.jp'));
  // 移行期は旧ドメインからの書き込みも通す（403 で操作が失敗しないように）
  assert.ok(list.includes('https://jsdf-chiiki-events.vercel.app'));
  assert.strictEqual(list.length, new Set(list).size);
});

test('allowedOrigins: 本番では localhost を含めない', () => {
  const prod = S.allowedOrigins({ SITE_URL: 'https://example.jp' }, false);
  assert.ok(!prod.some(o => /localhost|127\.0\.0\.1/.test(o)));
  const dev = S.allowedOrigins({ SITE_URL: 'https://example.jp' }, true);
  assert.ok(dev.some(o => /localhost/.test(o)));
});

test('allowedOrigins: SITE_ORIGINS の不正値は捨てる（全許可にしない）', () => {
  const list = S.allowedOrigins({ SITE_ORIGINS: 'example.jp,javascript:alert(1),,https://ok.jp' }, false);
  assert.ok(list.includes('https://ok.jp'));
  assert.ok(!list.some(o => /javascript|^example/.test(o)));
});

// ── 移行漏れの検出（ドメインを直書きした箇所が復活していないか） ──────────

test('公開URLをコードに直書きしていない（shared/siteUrl.cjs 以外）', () => {
  const files = [
    'scripts/generate-events-html.mjs', 'scripts/indexnow.mjs',
    'api/og.js', 'api/_security.js', 'api/admin/overrides.js', 'api/admin/past-events.js',
    'src/utils/calendar.js', 'vite.config.js',
  ];
  for (const f of files) {
    const src = fs.readFileSync(root(f), 'utf8');
    assert.ok(!src.includes('jsdf-chiiki-events.vercel.app'),
      `${f} に公開URLが直書きされている。shared/siteUrl.cjs 経由にすること`);
  }
});

test('vercel.json の CORS 許可オリジンが公開URLと一致している', () => {
  // vercel.json は静的JSONのため SITE_URL を差し込めない。ドメイン移行のときは
  // ここを手で書き換える必要があるので、忘れたら CI で気付けるようにする。
  const vercel = JSON.parse(fs.readFileSync(root('vercel.json'), 'utf8'));
  const origins = new Set();
  for (const h of vercel.headers || []) {
    for (const kv of h.headers || []) {
      if (kv.key === 'Access-Control-Allow-Origin') origins.add(kv.value);
    }
  }
  assert.ok(origins.size > 0, 'Access-Control-Allow-Origin が見つからない');
  for (const o of origins) {
    assert.strictEqual(o, S.DEFAULT_SITE_URL,
      `vercel.json の Access-Control-Allow-Origin (${o}) が shared/siteUrl.cjs の DEFAULT_SITE_URL と違う。`
      + 'ドメイン移行時は両方を新ドメインへ揃えること');
  }
});

test('index.html の絶対URLは既定ドメインのまま（ビルド時に SITE_URL へ置換する）', () => {
  const html = fs.readFileSync(root('index.html'), 'utf8');
  const urls = html.match(/https:\/\/[a-z0-9.-]+\.(app|jp|com)/gi) || [];
  const own = urls.filter(u => !/mod\.go\.jp|google|gstatic|schema\.org/i.test(u));
  assert.ok(own.length > 0, 'index.html に自サイトの絶対URLが無い');
  for (const u of own) {
    assert.ok(S.DEFAULT_SITE_URL.startsWith(u) || u === S.DEFAULT_SITE_URL,
      `index.html の ${u} が DEFAULT_SITE_URL と違う（ビルド時置換が効かなくなる）`);
  }
});
