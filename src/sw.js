import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

// ── 即時更新（古いバンドルが残り続けて新機能が出ない問題を防ぐ） ──
// skipWaiting + clients.claim で新しい SW を待たせず即有効化する。
self.skipWaiting();
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// ── プリキャッシュ ─────────────────────────────────────────────
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// ── SPAナビゲーション（/event/:id 等の個別URLをオフライン/PWAでも解決） ──
// 拡張子付きパス（静的HTML/画像/JSON等）・API・運営者ページは対象外。
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), {
  denylist: [/^\/api\//, /^\/admin/, /\.[a-z0-9]+$/i],
}));

// ── キャッシュ由来の応答に印を付ける ──────────────────────────
// NetworkFirst はネットワークに失敗するとキャッシュを返すが、ページ側からは
// 通常の 200 応答と区別が付かない。そのままだと「オフラインなのに取得成功」と
// 誤判定し、いつ時点の情報かを利用者に示せない。
// キャッシュから返すときだけヘッダーを足して、ページ側が判別できるようにする。
const markFromCache = {
  async cachedResponseWillBeUsed({ cachedResponse }) {
    if (!cachedResponse) return cachedResponse;
    const headers = new Headers(cachedResponse.headers);
    headers.set('X-From-Cache', '1');
    return new Response(await cachedResponse.blob(), {
      status:     cachedResponse.status,
      statusText: cachedResponse.statusText,
      headers,
    });
  },
};

// ── ランタイムキャッシュ ──────────────────────────────────────
// イベント本体。NetworkFirst なので、オンラインなら常に最新を取りに行く。
// maxAgeSeconds は「ネットワークが失敗したときに、どこまで古いキャッシュを
// 出してよいか」の上限であって、鮮度の上限ではない。
// ここが 5 分だった頃は、5 分を過ぎたキャッシュが破棄されるため
// オフラインだとイベントが 1 件も表示されない「空のアプリ」になっていた。
// オフラインでも中身を見せることを優先し、フォールバックの寿命を長く取る
// （古さは画面側のオフライン表示で利用者に明示する）。
registerRoute(
  ({ url }) => url.pathname === '/data/events.json',
  new NetworkFirst({
    cacheName: 'events-data',
    plugins: [new ExpirationPlugin({ maxEntries: 2, maxAgeSeconds: 60 * 60 * 24 * 30, purgeOnQuotaError: true }), markFromCache],
    networkTimeoutSeconds: 5,
  })
);

// 公開読み取り（手動イベント）のみキャッシュ対象にする。
// 管理API（/api/admin/*）や報告・購読などはキャッシュせず常に最新をネットワークから取得。
// 運営の手動イベント・上書き修正。events.json と同じ理由でフォールバックを長く保つ。
registerRoute(
  ({ url }) => url.pathname === '/api/manual-events',
  new NetworkFirst({
    cacheName: 'api-cache',
    plugins: [new ExpirationPlugin({ maxEntries: 2, maxAgeSeconds: 60 * 60 * 24 * 7, purgeOnQuotaError: true }), markFromCache],
    networkTimeoutSeconds: 8,
  })
);

// 募集案内所の拠点データ（「近くの募集案内所」）。ほとんど変化しないため
// StaleWhileRevalidate で即表示しつつ裏で更新し、オフラインでも使えるようにする。
registerRoute(
  ({ url }) => url.pathname === '/data/offices.json',
  new StaleWhileRevalidate({
    cacheName: 'offices-data',
    plugins: [new ExpirationPlugin({ maxEntries: 2, maxAgeSeconds: 60 * 60 * 24 * 30, purgeOnQuotaError: true })],
  })
);

// 天気予報（詳細画面の遅延取得）。主キャッシュはサーバー側（Redis + CDN）。
// SW は補助的に「短期間」だけ保持し、再描画のちらつき抑制とネットワーク障害時の
// フォールバックに限定する（長期間古い予報を返さない）。
// NetworkFirst なので通常は常に最新を取りに行き、失敗時のみ短期キャッシュを返す。
// 古い予報の混乱を避けるため maxAgeSeconds は短く（10分）、件数も制限する。
// キャッシュ名にバージョンを付け、仕様変更時に確実に作り直す。
// ※サーバー応答の stale:true（前回正常データ）と、SW由来の古い応答は別物。
//   前者は本文の stale フラグで判別でき、画面に「前回の情報」と明示される。
registerRoute(
  ({ url }) => url.pathname === '/api/weather',
  new NetworkFirst({
    cacheName: 'weather-cache-v1',
    plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 600, purgeOnQuotaError: true })],
    networkTimeoutSeconds: 6,
  })
);

registerRoute(
  ({ url }) => url.hostname === 'fonts.googleapis.com',
  new StaleWhileRevalidate({ cacheName: 'google-fonts-stylesheets' })
);

registerRoute(
  ({ url }) => url.hostname === 'fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'google-fonts-webfonts',
    plugins: [new ExpirationPlugin({ maxAgeSeconds: 60 * 60 * 24 * 365 })],
  })
);

// ── プッシュ通知受信 ───────────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { payload = { title: '自衛隊地本イベント', body: event.data.text() }; }

  const { title = '自衛隊地本イベント', body = '新しいイベントが追加されました', url = '/', badge, icon } = payload;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon:  icon  || '/icons/icon-192.png',
      badge: badge || '/icons/icon-192.png',
      data:  { url },
      tag:   'jsdf-event',
      renotify: true,
      vibrate: [100, 50, 100],
    })
  );
});

// ── 通知クリック → アプリを開く ────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // すでに開いているタブがあればフォーカス
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      // なければ新しいウィンドウを開く
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

// ── プッシュ購読取消し通知 ─────────────────────────────────────
self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil(
    self.registration.pushManager.subscribe({ userVisibleOnly: true })
      .then(sub => fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub }),
      }))
  );
});
