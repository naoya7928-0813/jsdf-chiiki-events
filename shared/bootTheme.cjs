'use strict';
/**
 * 起動時のテーマ確定（白フラッシュ対策）。
 *
 * グローバルCSS（src/globalStyles.js）は main.jsx が JS 実行時に注入するため、
 * それまでの間 body はライト色のまま描画される。結果、ダーク利用者は
 * コールドロードのたびに白い画面を経由していた（2026-08-27 修正）。
 *
 * ここで生成する <style> と <script> を vite.config.js が index.html /
 * admin.html の <head> 先頭へ注入する。両方とも**初回描画前**に走る:
 *   - <style>  … OS がダークなら CSS だけでダーク背景にする（JS 不要）
 *   - <script> … 利用者が明示的に選んだ設定（localStorage）を data-theme に反映する
 *                （OS ライト＋明示ダーク のように CSS だけでは分からない場合のため）
 *
 * 公開アプリ（index.html）では、あわせて **選択中の配色（陸/海/空）を PWA へ反映**する:
 *   - <meta name="theme-color">   … ステータスバーの色。初回描画前に確定させないと、
 *                                   ホーム画面から起動するたび既定色が一瞬挟まる
 *   - <link rel="manifest">        … 配色ごとの manifest へ差し替える（ホーム画面へ
 *                                   追加した時点の配色でアイコン・スプラッシュが決まる）
 *   - <link rel="apple-touch-icon"> … iOS のホーム画面アイコンを配色に合わせる
 * 色・パスは shared/pwaTheme.cjs が唯一の出どころ（ここには直書きしない）。
 *
 * ⚠️ BOOT_BG は src/globalStyles.js の `--bg` と一致していなければならない。
 *    ズレると「起動直後の色」と「アプリ描画後の色」が変わって余計にちらつく。
 *    shared/bootTheme.test.cjs が実ファイルを読んで一致を検証している。
 */

// 配色（陸/海/空）の色とキーは shared/pwaTheme.cjs が唯一の出どころ
const { SCHEME_KEYS, DEFAULT_SCHEME, PWA_SCHEMES, SCHEME_KEY } = require('./pwaTheme.cjs');

/** 起動時の背景色（src/globalStyles.js の --bg と同値であること） */
const BOOT_BG = { light: '#f5f6f8', dark: '#0d1117' };

/** テーマの保存キー（src/App.jsx の loadDarkMode と同じキー） */
const DARK_MODE_KEY = 'jsdf-dark';

/**
 * JS 実行前に効く CSS。
 * data-theme が付いていればそれを優先し、無ければ OS 設定に従う。
 * （globalStyles.js の :root / [data-theme] と同じ優先順位）
 */
function bootThemeStyle() {
  return [
    ':root{--boot-bg:' + BOOT_BG.light + '}',
    '@media (prefers-color-scheme:dark){',
    ':root:not([data-theme="light"]){--boot-bg:' + BOOT_BG.dark + '}',
    '}',
    ':root[data-theme="dark"]{--boot-bg:' + BOOT_BG.dark + '}',
    ':root[data-theme="light"]{--boot-bg:' + BOOT_BG.light + '}',
    'html{background:var(--boot-bg)}',
    'body{background:var(--boot-bg)}',
  ].join('');
}

/**
 * 選択中の配色を PWA へ反映する部分（公開アプリのみ）。
 *
 * theme-color は **その場で**確定させる（初回描画に効くのはこれだけ）。
 * manifest / apple-touch-icon の <link> はこの時点ではまだ DOM に無いため、
 * DOMContentLoaded まで待ってから差し替える（インストール操作より十分早い）。
 *
 * ⚠ この <meta name="theme-color"> は index.html には書かない。
 *   静的に書くと「HTML の既定色 → JS が上書き」で色が変わって見えるため、
 *   ここで生成して最初から正しい色にする（作れなかった場合は色指定なし＝
 *   ブラウザ既定に戻るだけで、表示は壊れない）。
 */
function bootSchemeScript() {
  const themes = {};
  for (const [key, v] of Object.entries(PWA_SCHEMES)) themes[key] = v.theme;
  return [
    'try{',
    'var K=' + JSON.stringify(SCHEME_KEYS) + ',C=' + JSON.stringify(themes) + ';',
    'var s=null;try{s=localStorage.getItem("' + SCHEME_KEY + '");}catch(e){}',
    'if(K.indexOf(s)<0)s="' + DEFAULT_SCHEME + '";',
    'document.documentElement.dataset.scheme=s;',
    'var t=document.querySelector(\'meta[name="theme-color"]\');',
    'if(!t){t=document.createElement("meta");t.setAttribute("name","theme-color");document.head.appendChild(t);}',
    't.setAttribute("content",C[s]);',
    'var p=function(){',
    'var m=document.querySelector(\'link[rel="manifest"]\');',
    'if(m)m.setAttribute("href","/manifest-"+s+".webmanifest");',
    'var a=document.querySelector(\'link[rel="apple-touch-icon"]\');',
    'if(a)a.setAttribute("href","/icons/apple-touch-icon-"+s+".png");',
    '};',
    'if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",p);else p();',
    '}catch(e){}',
  ].join('');
}

/**
 * 初回描画前に data-theme を確定させるスクリプト（同期実行・<head> 内）。
 * src/App.jsx の resolveIsDark(loadDarkMode()) と同じ判定:
 *   'dark' → dark / 'light' → light / それ以外（'system'・未設定）→ OS 設定
 * localStorage が使えない環境（プライベートモード等）では何もせず、
 * 上の CSS（prefers-color-scheme）に任せる。
 *
 * @param {object} [opts] scheme: 配色を PWA へ反映するか（公開アプリのみ true）
 */
function bootThemeScript(opts = {}) {
  return [
    '(function(){try{',
    'var m=localStorage.getItem("' + DARK_MODE_KEY + '")||"system";',
    'var d=m==="dark"||(m!=="light"&&window.matchMedia("(prefers-color-scheme:dark)").matches);',
    'document.documentElement.dataset.theme=d?"dark":"light";',
    '}catch(e){}',
    opts.scheme ? bootSchemeScript() : '',
    '})();',
  ].join('');
}

/** <head> へ注入する HTML 断片 */
function bootThemeHtml(opts = {}) {
  return '<style>' + bootThemeStyle() + '</style><script>' + bootThemeScript(opts) + '</script>';
}

module.exports = {
  BOOT_BG, DARK_MODE_KEY,
  bootThemeStyle, bootSchemeScript, bootThemeScript, bootThemeHtml,
};
