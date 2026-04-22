import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// package.json からバージョンを読み取り、ビルド時に __APP_VERSION__ として埋め込む
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: '自衛隊地本イベント情報',
        short_name: '地本イベント',
        description: '自衛隊地方協力本部のイベント情報をまとめて表示するアプリ',
        theme_color: '#0b2545',
        background_color: '#f5f6f8',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        lang: 'ja',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /\/data\/events\.json/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'events-data',
              expiration: { maxAgeSeconds: 180 },
              networkTimeoutSeconds: 8,
            },
          },
          {
            urlPattern: /^\/api\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxAgeSeconds: 300 },
              networkTimeoutSeconds: 10,
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
});
