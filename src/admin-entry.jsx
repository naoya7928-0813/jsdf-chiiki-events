// 運営者専用ページ（/admin.html）のエントリ。
// 公開アプリ（/）とは別口。AdminScreen をログイン付きで単体表示する。
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ErrorBoundary from './components/ErrorBoundary';
import AdminScreen from './components/AdminScreen';

// 公開アプリと同じ CSS 変数（ライト/ダーク）を最小限注入
const style = document.createElement('style');
style.textContent = `
  :root {
    --bg:#f5f6f8; --card:#fff; --border:#e5e8ee; --sep:#eef1f6;
    --text:#0f172a; --text-sub:#475569; --text-muted:#6b7280; --icon-muted:#c8cdd6; --tag-bg:#eef1f6;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg:#0d1117; --card:#161b22; --border:#30363d; --sep:#21262d;
      --text:#e6edf3; --text-sub:#8b949e; --text-muted:#6e7681; --icon-muted:#484f58; --tag-bg:#21262d;
    }
  }
  * { box-sizing: border-box; }
  html, body, #root { height: 100%; margin: 0; background: var(--bg); }
  body { font-family: "Noto Sans JP", sans-serif; }
`;
document.head.appendChild(style);

// 海自カラーを既定テーマに（運営ページの配色）
const THEME = { primary: '#0b2545', accent: '#8b2e2e', schemeKey: 'jmsdf' };

// 公開アプリの詳細画面「編集」から渡された対象イベント（sessionStorage 経由）
function consumeEditTarget() {
  try {
    const raw = sessionStorage.getItem('jsdf-admin-edit');
    if (raw) { sessionStorage.removeItem('jsdf-admin-edit'); return JSON.parse(raw); }
  } catch { /* noop */ }
  return null;
}

function AdminApp() {
  const [editTarget] = useState(consumeEditTarget);
  return (
    <div style={{ maxWidth: 480, margin: '0 auto', height: '100dvh', background: 'var(--bg)' }}>
      <AdminScreen
        theme={THEME}
        mode="manage"
        initialFilter="all"
        initialEditEvent={editTarget}
        onBack={() => { window.location.href = '/'; }}
      />
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <AdminApp />
  </ErrorBoundary>
);
