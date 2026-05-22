import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

// ── プリキャッシュ ─────────────────────────────────────────────
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// ── ランタイムキャッシュ ──────────────────────────────────────
registerRoute(
  ({ url }) => url.pathname === '/data/events.json',
  new NetworkFirst({
    cacheName: 'events-data',
    plugins: [new ExpirationPlugin({ maxAgeSeconds: 300 })],
    networkTimeoutSeconds: 5,
  })
);

registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'api-cache',
    plugins: [new ExpirationPlugin({ maxAgeSeconds: 300 })],
    networkTimeoutSeconds: 10,
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
