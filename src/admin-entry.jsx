// 運営者専用ページ（/admin.html）のエントリ。公開アプリ(/)とは別口。
// 表示方法は #admin の頃と同じく、アプリと同一テーマ・同一コンテナで全画面表示する。
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { injectGlobalStyles } from './globalStyles';
import { COLOR_SCHEMES, DEFAULT_SCHEME } from './config';
import ErrorBoundary from './components/ErrorBoundary';
import AdminScreen from './components/AdminScreen';

// 公開アプリと同じグローバルCSS（CSS変数・リセット）
injectGlobalStyles();

// 公開アプリと同じ配色設定を localStorage から引き継ぐ
function loadScheme()  { try { return localStorage.getItem('jsdf-scheme') || DEFAULT_SCHEME; } catch { return DEFAULT_SCHEME; } }
function loadDark()    { try { return localStorage.getItem('jsdf-dark')   || 'system';       } catch { return 'system'; } }
function resolveIsDark(mode) {
  if (mode === 'dark')  return true;
  if (mode === 'light') return false;
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch { return false; }
}

// 公開アプリの詳細「編集」から渡された対象イベント（sessionStorage 経由）
function consumeEditTarget() {
  try {
    const raw = sessionStorage.getItem('jsdf-admin-edit');
    if (raw) { sessionStorage.removeItem('jsdf-admin-edit'); return JSON.parse(raw); }
  } catch { /* noop */ }
  return null;
}

function AdminApp() {
  const schemeKey = loadScheme();
  const darkMode  = loadDark();
  document.documentElement.dataset.theme = resolveIsDark(darkMode) ? 'dark' : 'light';
  const scheme = COLOR_SCHEMES[schemeKey] ?? COLOR_SCHEMES[DEFAULT_SCHEME];
  const theme  = { ...scheme, schemeKey, darkMode };

  const [editTarget] = useState(consumeEditTarget);

  // #admin の頃と同じく、アプリと同一の中央コンテナで全画面表示
  return (
    <div style={{
      maxWidth: 430, margin: '0 auto', height: '100dvh',
      display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden',
      background: 'var(--bg)', boxShadow: '0 0 40px rgba(0,0,0,0.12)',
    }}>
      <AdminScreen
        theme={theme}
        mode="manage"
        initialFilter="all"
        initialEditEvent={editTarget}
        showTabs
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
