import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// package.json からバージョンを読み取り、ビルド時に __APP_VERSION__ として埋め込む
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));
const r = (p) => fileURLToPath(new URL(p, import.meta.url));

// admin.html だけ別マニフェストを参照させる。vite-plugin-pwa は全HTMLに
// 公開用 /manifest.webmanifest（start_url:"/"）を注入するため、その後に
// admin.html のみ /admin.webmanifest（start_url:"/admin.html"）へ差し替える。
// これでホーム画面追加時、運営アプリは運営サイトを起動し、公開と別アプリになる。
// shared/*.cjs は scraper・API・CI と共有するため CommonJS のまま置いている。
// 本番ビルドは rollup の commonjs 変換で名前付き export に解決されるが、dev サーバーは
// 素の .cjs をそのまま ESM として配信するため `module.exports` が見えず、
// 名前付き import が全滅してアプリが起動しない。dev のみ ESM ラッパーへ変換する。
function sharedCjsDevInterop() {
  const require_ = createRequire(import.meta.url);
  return {
    name: 'shared-cjs-dev-interop',
    apply: 'serve',
    enforce: 'pre',
    transform(code, id) {
      const path = id.split('?')[0].replace(/\\/g, '/');
      if (!/\/shared\/[^/]+\.cjs$/.test(path)) return null;

      // shared 同士の相互参照（require('./weather.cjs') 等）は静的 import に置き換える
      const imports = [];
      let n = 0;
      const body = code.replace(/require\((['"])(\.[^'"]+)\1\)/g, (_, q, spec) => {
        const local = `__cjs${n++}`;
        imports.push(`import ${local} from '${spec}';`);
        return local;
      });

      // 名前付き export は実物を Node で読み込んで取得する（正規表現で推測しない）
      let names = [];
      try {
        names = Object.keys(require_(path)).filter(k => /^[A-Za-z_$][\w$]*$/.test(k));
      } catch { /* 読めない場合は default だけ生やす */ }

      // CJS 側と同名の関数宣言が既にあるため、別名で受けてから export する
      const alias = k => `__ex_${k}`;
      return {
        code: [
          ...imports,
          'const module = { exports: {} };',
          'const exports = module.exports;',
          body,
          ...names.map(k => `const ${alias(k)} = module.exports.${k};`),
          names.length ? `export { ${names.map(k => `${alias(k)} as ${k}`).join(', ')} };` : '',
          'export default module.exports;',
        ].join('\n'),
        map: null,
      };
    },
  };
}

function adminManifestSwap() {
  return {
    name: 'admin-manifest-swap',
    // ビルド完了後（vite-plugin-pwa の注入も終わった後）に dist/admin.html を書き換える
    closeBundle() {
      try {
        const fp = r('./dist/admin.html');
        if (!existsSync(fp)) return;
        let html = readFileSync(fp, 'utf8');
        if (html.includes('/manifest.webmanifest')) {
          html = html.replace(/href="\/manifest\.webmanifest"/g, 'href="/admin.webmanifest"');
          writeFileSync(fp, html);
          // eslint-disable-next-line no-console
          console.log('[admin-manifest-swap] dist/admin.html を /admin.webmanifest に差し替えました');
        }
      } catch (e) { console.warn('[admin-manifest-swap] 失敗:', e?.message); }
    },
  };
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    rollupOptions: {
      // 公開アプリ(index) と 運営者専用ページ(admin) の2エントリ
      input: { main: r('./index.html'), admin: r('./admin.html') },
      output: {
        // ライブラリを分離してキャッシュ効率を上げる（アプリコード変更で
        // vendor チャンクが無効化されない。フィードバック§1-2③）
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'vendor-react';
          if (id.includes('@fontsource')) return undefined; // フォントCSSは各エントリへ
          return 'vendor';
        },
      },
    },
  },
  plugins: [
    react(),
    sharedCjsDevInterop(),
    adminManifestSwap(),
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
        id: '/',
        scope: '/',
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
