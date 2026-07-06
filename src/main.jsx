import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// フォントはセルフホスト（Google Fonts への外部接続を廃止。CSP縮小・読み込み安定化）
import '@fontsource-variable/noto-sans-jp';
import '@fontsource-variable/noto-serif-jp';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import { inject as injectAnalytics } from '@vercel/analytics';
import { injectSpeedInsights } from '@vercel/speed-insights';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { injectGlobalStyles } from './globalStyles';

// ─── グローバルスタイル（公開/運営で共通） ──────────────────────
injectGlobalStyles();

// ─── 計測（Vercel Analytics / Speed Insights。ダッシュボードで有効化が必要） ──
// 実ユーザーの Core Web Vitals とアクセス動向を取得（Cookie不使用・プライバシー配慮型）
injectAnalytics();
injectSpeedInsights();

// vite-plugin-pwa が registerType:'autoUpdate' で SW を自動登録するため手動登録は不要

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
