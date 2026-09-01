'use strict';
/**
 * pwaTheme のテスト
 *
 * 純粋な関数の確認に加えて、**実ファイルを読んでズレを検出する**ものを重視する。
 * PWA の色は「アプリ内の配色」「起動スプラッシュ」「ルーティング」と別ファイルに
 * ある値と揃っていないと、起動のたびに色が変わったり、ショートカットが
 * 404 に着地したりする。人が気づきにくいので機械で止める。
 */
const test = require('node:test');
const assert = require('node:assert');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const pwa = require('./pwaTheme.cjs');
const {
  SCHEME_KEYS, DEFAULT_SCHEME, PWA_SCHEMES, SHORTCUTS,
  normalizeScheme, themeColorFor, splashColorFor,
  manifestPathFor, appleTouchIconFor, buildManifest,
} = pwa;

const read = (rel) => readFileSync(join(__dirname, '..', rel), 'utf8');

// ── 基本 ────────────────────────────────────────────────────
test('normalizeScheme: 未知・空・不正は既定へ丸める', () => {
  assert.equal(normalizeScheme('jmsdf'), 'jmsdf');
  assert.equal(normalizeScheme('unknown'), DEFAULT_SCHEME);
  assert.equal(normalizeScheme(''), DEFAULT_SCHEME);
  assert.equal(normalizeScheme(null), DEFAULT_SCHEME);
  assert.equal(normalizeScheme(undefined), DEFAULT_SCHEME);
});

test('themeColorFor / splashColorFor: 全配色が #rrggbb を返す', () => {
  for (const key of SCHEME_KEYS) {
    assert.match(themeColorFor(key), /^#[0-9a-f]{6}$/);
    assert.match(splashColorFor(key), /^#[0-9a-f]{6}$/);
  }
  // 不正な値でも落ちない（既定色になる）
  assert.equal(themeColorFor('???'), themeColorFor(DEFAULT_SCHEME));
});

test('manifestPathFor / appleTouchIconFor: 配色ごとに別のパスになる', () => {
  const manifests = SCHEME_KEYS.map(manifestPathFor);
  const icons     = SCHEME_KEYS.map(appleTouchIconFor);
  assert.equal(new Set(manifests).size, SCHEME_KEYS.length);
  assert.equal(new Set(icons).size, SCHEME_KEYS.length);
  assert.equal(manifestPathFor('jmsdf'), '/manifest-jmsdf.webmanifest');
  assert.equal(appleTouchIconFor('jasdf'), '/icons/apple-touch-icon-jasdf.png');
});

// ── 実ファイルとの突き合わせ ──────────────────────────────────
test('theme_color は src/config.js の COLOR_SCHEMES.primary と一致する', () => {
  const config = read('src/config.js');
  for (const key of SCHEME_KEYS) {
    // 例: jgsdf: { primary: '#3a4130', ...
    const m = new RegExp(`${key}:\\s*\\{\\s*primary:\\s*'(#[0-9a-f]{6})'`).exec(config);
    assert.ok(m, `${key} の primary を src/config.js から読み取れませんでした`);
    assert.equal(
      themeColorFor(key), m[1],
      `${key}: ステータスバーの色がアプリのヘッダー色と違います（片方だけ直すと起動時に色が変わって見えます）`
    );
  }
});

test('background_color は SplashScreen の背景に含まれる色である', () => {
  const splash = read('src/components/SplashScreen.jsx');
  for (const key of SCHEME_KEYS) {
    const color = splashColorFor(key);
    assert.ok(
      splash.includes(color),
      `${key}: ${color} が SplashScreen の CONFIGS に見当たりません`
      + '（OSのスプラッシュとアプリのスプラッシュで地色が変わり、起動のたびにちらつきます）'
    );
  }
});

test('background_color は明るい色ではない（起動時の白い画面を防ぐ）', () => {
  // アプリ側のスプラッシュはどの配色も暗い。OS 側だけ白いと必ず白画面を経由する。
  for (const key of SCHEME_KEYS) {
    const [r, g, b] = splashColorFor(key).slice(1).match(/../g).map(h => parseInt(h, 16));
    const lightness = (r + g + b) / 3;
    assert.ok(lightness < 80, `${key}: background_color が明るすぎます（${splashColorFor(key)}）`);
  }
});

test('ショートカットの URL は App.jsx に実在する画面である', () => {
  const app = read('src/App.jsx');
  // ROUTE_SCREENS = { home: '/', list: '/list', ... } からパスを集める
  const block = /const ROUTE_SCREENS = \{([\s\S]*?)\};/.exec(app);
  assert.ok(block, 'App.jsx の ROUTE_SCREENS を読み取れませんでした');
  const routes = [...block[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  for (const s of SHORTCUTS) {
    assert.ok(
      routes.includes(s.url),
      `ショートカット「${s.name}」の ${s.url} が ROUTE_SCREENS にありません（404 画面に着地します）`
    );
  }
});

test('ショートカット名はアプリ内の画面名と揃っている', () => {
  // ランチャーの表示名と画面の名前が違うと「押したら別のものが出た」と感じる。
  const byUrl = Object.fromEntries(SHORTCUTS.map(s => [s.url, s.name]));
  assert.equal(byUrl['/favorites'], 'お気に入り');
  assert.equal(byUrl['/settings'], '設定');
  assert.equal(byUrl['/notifications'], '通知');   // NotificationScreen の見出しと同じ
  assert.equal(byUrl['/list'], 'イベント一覧');    // ListScreen の見出しと同じ
  assert.ok(read('src/components/ListScreen.jsx').includes('イベント一覧'));
  assert.ok(read('src/components/NotificationScreen.jsx').includes('title="通知"'));
});

test('配色キーは src/config.js の COLOR_SCHEMES と同じ顔ぶれ', () => {
  const config = read('src/config.js');
  const block = /export const COLOR_SCHEMES = \{([\s\S]*?)\n\};/.exec(config);
  assert.ok(block, 'COLOR_SCHEMES を読み取れませんでした');
  const keys = [...block[1].matchAll(/^\s{2}([a-z]+):/gm)].map(m => m[1]);
  assert.deepEqual(keys, SCHEME_KEYS);
  assert.match(config, new RegExp(`DEFAULT_SCHEME = '${DEFAULT_SCHEME}'`));
});

// ── manifest ────────────────────────────────────────────────
test('buildManifest: 配色ごとに色とアイコンが変わる', () => {
  for (const key of SCHEME_KEYS) {
    const m = buildManifest(key);
    assert.equal(m.theme_color, PWA_SCHEMES[key].theme);
    assert.equal(m.background_color, PWA_SCHEMES[key].splash);
    assert.ok(m.icons.every(i => i.src.includes(key)), `${key}: アイコンが配色ごとになっていません`);
    assert.ok(m.icons.some(i => i.purpose === 'maskable'), 'maskable アイコンがありません');
    assert.equal(m.shortcuts.length, SHORTCUTS.length);
    assert.ok(m.shortcuts.every(s => s.icons[0].src.includes(key)));
  }
});

test('buildManifest: 画面の向きを固定しない', () => {
  // manifest で portrait に固定すると、アプリ内の「表示の向き」設定が
  // インストール版だけ効かなくなり、横向きレイアウトを一切使えなくなる。
  for (const key of SCHEME_KEYS) {
    assert.equal(buildManifest(key).orientation, undefined);
  }
  assert.ok(!read('public/admin.webmanifest').includes('"orientation"'));
});

test('buildManifest: ホーム画面アプリとして開く設定になっている', () => {
  const m = buildManifest(DEFAULT_SCHEME);
  assert.equal(m.display, 'standalone');
  assert.equal(m.id, '/');
  assert.equal(m.scope, '/');
  assert.equal(m.start_url, '/');
  // ショートカットから開いたときに毎回ウィンドウが増えないようにする
  assert.equal(m.launch_handler.client_mode, 'navigate-existing');
});

test('生成済みの public/manifest-*.webmanifest が buildManifest と一致する', () => {
  // 生成を忘れたまま色やショートカットを変えると、配信されるのは古い manifest になる
  for (const key of SCHEME_KEYS) {
    const file = manifestPathFor(key).replace(/^\//, '');
    const onDisk = JSON.parse(read(join('public', file)));
    assert.deepEqual(
      onDisk, buildManifest(key),
      `${file} が古いままです（npm run generate-manifests を実行してください）`
    );
  }
});

test('manifest が参照するアイコンが実在する', () => {
  for (const key of SCHEME_KEYS) {
    const m = buildManifest(key);
    const srcs = [...m.icons.map(i => i.src), ...m.shortcuts.map(s => s.icons[0].src)];
    for (const src of srcs) {
      assert.doesNotThrow(
        () => readFileSync(join(__dirname, '..', 'public', src.replace(/^\//, ''))),
        `${src} がありません（npm run generate-icons を実行してください）`
      );
    }
    assert.doesNotThrow(
      () => readFileSync(join(__dirname, '..', 'public', appleTouchIconFor(key).replace(/^\//, ''))),
      `${appleTouchIconFor(key)} がありません`
    );
  }
});

// ── 起動時スクリプト（初回描画前の反映） ──────────────────────
test('bootThemeScript: 公開アプリでは配色を PWA へ反映する', () => {
  const { bootThemeScript } = require('./bootTheme.cjs');
  const js = bootThemeScript({ scheme: true });
  assert.ok(js.includes('theme-color'), 'theme-color を設定していません');
  assert.ok(js.includes('manifest-'), 'manifest を差し替えていません');
  assert.ok(js.includes('apple-touch-icon'), 'apple-touch-icon を差し替えていません');
  for (const key of SCHEME_KEYS) assert.ok(js.includes(themeColorFor(key)), `${key} の色がありません`);
});

test('bootThemeScript: 運営者ページでは配色を反映しない（専用 manifest のため）', () => {
  const { bootThemeScript } = require('./bootTheme.cjs');
  const js = bootThemeScript();
  assert.ok(!js.includes('manifest-'));
  assert.ok(js.includes('data-theme') || js.includes('dataset.theme'));
});

test('index.html に theme-color を直書きしない（起動時に色が変わるため）', () => {
  const html = read('index.html');
  assert.ok(
    !/<meta[^>]+name="theme-color"/.test(html),
    'index.html の <meta name="theme-color"> は shared/bootTheme.cjs が生成します'
  );
  // 全画面利用の宣言は標準名・iOS 用の両方を残しておくこと
  assert.ok(/name="mobile-web-app-capable"/.test(html));
  assert.ok(/name="apple-mobile-web-app-capable"/.test(html));
});
