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
 * ⚠️ BOOT_BG は src/globalStyles.js の `--bg` と一致していなければならない。
 *    ズレると「起動直後の色」と「アプリ描画後の色」が変わって余計にちらつく。
 *    shared/bootTheme.test.cjs が実ファイルを読んで一致を検証している。
 */

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
 * 初回描画前に data-theme を確定させるスクリプト（同期実行・<head> 内）。
 * src/App.jsx の resolveIsDark(loadDarkMode()) と同じ判定:
 *   'dark' → dark / 'light' → light / それ以外（'system'・未設定）→ OS 設定
 * localStorage が使えない環境（プライベートモード等）では何もせず、
 * 上の CSS（prefers-color-scheme）に任せる。
 */
function bootThemeScript() {
  return [
    '(function(){try{',
    'var m=localStorage.getItem("' + DARK_MODE_KEY + '")||"system";',
    'var d=m==="dark"||(m!=="light"&&window.matchMedia("(prefers-color-scheme:dark)").matches);',
    'document.documentElement.dataset.theme=d?"dark":"light";',
    '}catch(e){}})();',
  ].join('');
}

/** <head> へ注入する HTML 断片 */
function bootThemeHtml() {
  return '<style>' + bootThemeStyle() + '</style><script>' + bootThemeScript() + '</script>';
}

module.exports = { BOOT_BG, DARK_MODE_KEY, bootThemeStyle, bootThemeScript, bootThemeHtml };
