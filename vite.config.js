import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
// 公開URLの唯一の出どころ（ドメイン移行は SITE_URL の設定だけで完了する）
import { siteUrl, DEFAULT_SITE_URL } from './shared/siteUrl.cjs';
// PWA の配色・アイコン・ショートカットの唯一の出どころ（配色ごとの manifest と同じ関数）
import { buildManifest, DEFAULT_SCHEME } from './shared/pwaTheme.cjs';

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

/**
 * siteUrlInject — HTML 内の絶対URL（canonical / og:url / og:image / twitter:image）を
 * 環境変数 SITE_URL のドメインへ差し替える。
 *
 * index.html には既定ドメインを書いたままにしておき、ビルド時にここで置換する。
 * こうしておくとドメイン移行（例: .jp への移行）は SITE_URL を設定するだけで済み、
 * HTML を書き換えて回る必要がない。SITE_URL 未設定なら何もしない（従来と同じ出力）。
 */
function siteUrlInject() {
  const target = siteUrl(process.env);
  return {
    name: 'site-url-inject',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        if (target === DEFAULT_SITE_URL) return html;
        return html.split(DEFAULT_SITE_URL).join(target);
      },
    },
  };
}

// 起動時の白フラッシュ対策。index.html / admin.html の <head> 先頭へ、
// テーマを初回描画前に確定させる <style> と <script> を注入する。
// 中身は shared/bootTheme.cjs（色は globalStyles.js の --bg と一致。テストで検証）。
// dev サーバーでも同じ注入が走るので、開発と本番で見え方が変わらない。
function bootThemeInject() {
  const require_ = createRequire(import.meta.url);
  return {
    name: 'boot-theme-inject',
    enforce: 'pre',  // 他プラグインの注入より前に <head> 先頭へ置く
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        // 毎回読み直す（dev で bootTheme.cjs を編集したら再起動なしで反映）
        delete require_.cache[require_.resolve('./shared/bootTheme.cjs')];
        delete require_.cache[require_.resolve('./shared/pwaTheme.cjs')];
        const { bootThemeStyle, bootThemeScript } = require_('./shared/bootTheme.cjs');
        // 配色（陸/海/空）の PWA 反映は公開アプリだけ。運営者ページは
        // 専用の admin.webmanifest / アイコンを使うため対象外。
        const scheme = !/admin\.html$/.test(ctx?.path || ctx?.filename || '');
        return [
          { tag: 'style',  children: bootThemeStyle(),          injectTo: 'head-prepend' },
          { tag: 'script', children: bootThemeScript({ scheme }), injectTo: 'head-prepend' },
        ];
      },
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
    siteUrlInject(),
    bootThemeInject(),
    sharedCjsDevInterop(),
    adminManifestSwap(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      includeAssets: [
        'icons/icon.svg',
        // 配色ごとの manifest（実行時に link を差し替えるためオフラインでも要る）
        'manifest-jgsdf.webmanifest',
        'manifest-jmsdf.webmanifest',
        'manifest-jasdf.webmanifest',
        'icons/apple-touch-icon.png',
        'icons/apple-touch-icon-jgsdf.png',
        'icons/apple-touch-icon-jmsdf.png',
        'icons/apple-touch-icon-jasdf.png',
      ],
      // 既定の manifest（配色ごとの manifest-<scheme>.webmanifest と同じ関数で作る。
      // 実行時に <link rel="manifest"> を選択中の配色のものへ差し替える）
      manifest: buildManifest(DEFAULT_SCHEME),
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
});
