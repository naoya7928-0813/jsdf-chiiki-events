import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

// ─── グローバルスタイル ───────────────────────────────────────
// CSS変数でライト/ダーク両モードのカラーを定義する。
// コンポーネントは var(--bg) / var(--card) 等を inline style で参照する。
const style = document.createElement('style');
style.textContent = `
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
    }
  }

  /* ─── リセット & ベース ─── */
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  html, body {
    height: 100%;
    background: var(--bg);
    overscroll-behavior: none;
    -webkit-tap-highlight-color: transparent;
    -webkit-touch-callout: none;
  }

  body {
    font-feature-settings: "palt" 1;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
    color: var(--text);
  }

  #root {
    height: 100%;
    height: 100dvh;
  }

  /* スクロールバー非表示（モバイル風） */
  ::-webkit-scrollbar { display: none; }
  * { scrollbar-width: none; }

  /* ボタンのデフォルトスタイルリセット */
  button { -webkit-appearance: none; appearance: none; }

  /* アニメーション */
  @keyframes spin { to { transform: rotate(360deg); } }
`;
document.head.appendChild(style);

// vite-plugin-pwa が registerType:'autoUpdate' で SW を自動登録するため手動登録は不要

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
