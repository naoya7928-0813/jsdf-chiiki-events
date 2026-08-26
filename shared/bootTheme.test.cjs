'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const B = require('./bootTheme.cjs');

const root = path.join(__dirname, '..');
const read = p => readFileSync(path.join(root, p), 'utf8');

// ── 起動色が globalStyles.js とズレていないこと ────────────────────
// ズレると「起動直後の色」と「アプリ描画後の色」が変わり、直したはずの
// ちらつきが別の形で復活する。実ファイルを読んで検証する。
test('BOOT_BG が src/globalStyles.js の --bg と一致する', () => {
  const css = read('src/globalStyles.js');

  // :root { ... --bg: <light> ... }（最初の宣言＝ライト）
  const light = css.match(/--bg:\s*(#[0-9a-fA-F]{3,8});/);
  assert.ok(light, 'globalStyles.js に --bg が見つからない');
  assert.equal(light[1].toLowerCase(), B.BOOT_BG.light.toLowerCase());

  // [data-theme="dark"] ブロック内の --bg
  const darkBlock = css.match(/\[data-theme="dark"\]\s*\{[^}]*?--bg:\s*(#[0-9a-fA-F]{3,8});/);
  assert.ok(darkBlock, '[data-theme="dark"] の --bg が見つからない');
  assert.equal(darkBlock[1].toLowerCase(), B.BOOT_BG.dark.toLowerCase());

  // OS ダーク（data-theme 未指定）側の --bg も同値であること
  const mediaBlock = css.match(/@media \(prefers-color-scheme: dark\)[\s\S]*?--bg:\s*(#[0-9a-fA-F]{3,8});/);
  assert.ok(mediaBlock, '@media (prefers-color-scheme: dark) の --bg が見つからない');
  assert.equal(mediaBlock[1].toLowerCase(), B.BOOT_BG.dark.toLowerCase());
});

test('保存キーが src/App.jsx の読み出しキーと一致する', () => {
  const app = read('src/App.jsx');
  assert.ok(
    app.includes(`localStorage.getItem('${B.DARK_MODE_KEY}')`),
    `App.jsx が '${B.DARK_MODE_KEY}' を読んでいない（キーがズレると初期テーマが復元されない）`
  );
});

// ── 生成物の中身 ──────────────────────────────────────────────
test('CSS: data-theme が OS 設定より優先される', () => {
  const css = B.bootThemeStyle();
  // OS ダークの指定は data-theme="light" を除外している（明示ライトが勝つ）
  assert.match(css, /:root:not\(\[data-theme="light"\]\)\{--boot-bg:#0d1117\}/);
  // 明示指定は両方向とも定義がある（片方だけだと切り替えで戻らない）
  assert.match(css, /:root\[data-theme="dark"\]\{--boot-bg:#0d1117\}/);
  assert.match(css, /:root\[data-theme="light"\]\{--boot-bg:#f5f6f8\}/);
  // html と body の両方に敷く（body だけだと余白部分が白く残る）
  assert.match(css, /html\{background:var\(--boot-bg\)\}/);
  assert.match(css, /body\{background:var\(--boot-bg\)\}/);
});

test('script: 判定が App.jsx の resolveIsDark と同じ', () => {
  const js = B.bootThemeScript();
  // localStorage が使えなくても落とさない（プライベートモード等）
  assert.match(js, /try\{/);
  assert.match(js, /catch\(e\)\{\}/);
  // 'dark' は無条件ダーク、'light' は無条件ライト、その他は OS 設定
  assert.match(js, /m==="dark"/);
  assert.match(js, /m!=="light"/);
  assert.match(js, /prefers-color-scheme:dark/);
});

test('script: HTML に埋め込んでも </script> で切れない', () => {
  // インライン script 内に "</script>" があるとそこで閉じてしまう
  assert.ok(!/<\/script/i.test(B.bootThemeScript()));
  assert.ok(!/<\/style/i.test(B.bootThemeStyle()));
});

test('bootThemeHtml が style と script を両方含む', () => {
  const html = B.bootThemeHtml();
  assert.ok(html.includes('<style>') && html.includes('</style>'));
  assert.ok(html.includes('<script>') && html.includes('</script>'));
  assert.ok(html.indexOf('<style>') < html.indexOf('<script>'), 'style が先（script より前に効かせる）');
});
