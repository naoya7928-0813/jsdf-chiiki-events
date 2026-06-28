// 公開アプリ・運営者ページ共通のグローバルCSS（CSS変数 + リセット）。
// 両エントリ（main.jsx / admin-entry.jsx）で同じ見た目になるよう一元管理する。
export const GLOBAL_CSS = `
  /* ─── ライトモード（デフォルト） ─── */
  :root {
    --bg:         #f5f6f8;
    --card:       #ffffff;
    --border:     #e5e8ee;
    --sep:        #eef1f6;
    --text:       #0f172a;
    --text-sub:   #475569;
    --text-muted: #6b7280;
    --icon-muted: #c8cdd6;
    --month-sep:  #d8dce3;
    --tag-bg:     #eef1f6;
    --badge-bg:   #eef1f6;
    --map-gray:        #d1d5db;
    --map-hover:       #c4c8d0;
    --notice-bg:       rgba(133,107,0,0.07);
    --notice-border:   rgba(133,107,0,0.15);
  }

  /* ─── ダークモード ─── */
  [data-theme="dark"] {
    --bg:         #0d1117;
    --card:       #161b22;
    --border:     #30363d;
    --sep:        #21262d;
    --text:       #e6edf3;
    --text-sub:   #8b949e;
    --text-muted: #6e7681;
    --icon-muted: #484f58;
    --month-sep:  #30363d;
    --tag-bg:     #21262d;
    --badge-bg:   #21262d;
    --map-gray:        #2d3748;
    --map-hover:       #3d4a5e;
    --notice-bg:       rgba(255,200,0,0.06);
    --notice-border:   rgba(255,200,0,0.12);
  }

  /* ─── OS設定がダーク かつ data-theme 未指定の場合 ─── */
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]):not([data-theme="dark"]) {
      --bg:         #0d1117;
      --card:       #161b22;
      --border:     #30363d;
      --sep:        #21262d;
      --text:       #e6edf3;
      --text-sub:   #8b949e;
      --text-muted: #6e7681;
      --icon-muted: #484f58;
      --month-sep:  #30363d;
      --tag-bg:     #21262d;
      --badge-bg:   #21262d;
      --map-gray:        #2d3748;
      --map-hover:       #3d4a5e;
      --notice-bg:       rgba(255,200,0,0.06);
      --notice-border:   rgba(255,200,0,0.12);
    }
  }

  /* ─── リセット & ベース ─── */
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  html, body {
    height: 100%;
    background: var(--bg);
    /* ページ自体はスクロールさせず、アプリ内の領域だけスクロールさせる。
       モバイル（特にiOS）の下部ラバーバンド／余計な動きを抑える。 */
    overflow: hidden;
    overscroll-behavior: none;
    -webkit-tap-highlight-color: transparent;
    -webkit-touch-callout: none;
  }

  body {
    /* 画面に固定してビューポート外への移動（バウンス）を防ぐ */
    position: fixed;
    inset: 0;
    width: 100%;
    font-feature-settings: "palt" 1;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
    color: var(--text);
  }

  #root { height: 100%; height: 100dvh; overflow: hidden; }

  ::-webkit-scrollbar { display: none; }
  * { scrollbar-width: none; }
  button { -webkit-appearance: none; appearance: none; }
  @keyframes spin { to { transform: rotate(360deg); } }
`;

/** グローバルCSSを <head> に注入する */
export function injectGlobalStyles() {
  const el = document.createElement('style');
  el.textContent = GLOBAL_CSS;
  document.head.appendChild(el);
}
