// 運営者専用ページ（/admin.html）のエントリ。公開アプリ(/)とは別口。
// 中身は公開サイトの完全コピー（App）を「運営者モード」で起動したもの。
//  - 開いた時点でログイン必須
//  - 下部ナビに「管理」タブ（イベント追加・修正／下書き／変更履歴／CSV等）
//  - イベント詳細に編集ボタン
// 公開アプリ(/)にはこれらの機能・コードは一切含まれない（App に operator を渡さないため）。
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { injectGlobalStyles } from './globalStyles';

// 公開アプリと同じグローバルCSS（CSS変数・リセット）。配色/ダークモードは
// App 内で localStorage(jsdf-scheme / jsdf-dark) から復元するため、見た目は完全に揃う。
injectGlobalStyles();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App operator />
    </ErrorBoundary>
  </StrictMode>
);
