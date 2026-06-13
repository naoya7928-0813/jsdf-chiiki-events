import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { injectGlobalStyles } from './globalStyles';

// ─── グローバルスタイル（公開/運営で共通） ──────────────────────
injectGlobalStyles();

// vite-plugin-pwa が registerType:'autoUpdate' で SW を自動登録するため手動登録は不要

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
