import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// package.json からバージョンを読み取り、ビルド時に __APP_VERSION__ として埋め込む
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));
const r = (p) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    rollupOptions: {
      // 公開アプリ(index) と 運営者専用ページ(admin) の2エントリ
      input: { main: r('./index.html'), admin: r('./admin.html') },
    },
  },
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      includeAssets: [
        'icons/icon.svg',
        'icons/apple-touch-icon.png',
        'icons/apple-touch-icon-jgsdf.png',
        'icons/apple-touch-icon-jmsdf.png',
        'icons/apple-touch-icon-jasdf.png',
      ],
      manifest: {
        name: '地本イベント情報（非公式まとめ）',
        short_name: '地本イベント',
        description: '自衛隊地方協力本部のイベント情報をまとめた非公式アプリ',
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
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
});
