/**
 * 配色ごとの PWA manifest を生成するスクリプト
 * 実行: node scripts/generate-manifests.mjs
 *       または npm run build 時に自動実行
 *
 * 生成ファイル:
 *   public/manifest-jgsdf.webmanifest  — 陸上自衛隊カラー
 *   public/manifest-jmsdf.webmanifest  — 海上自衛隊カラー
 *   public/manifest-jasdf.webmanifest  — 航空自衛隊カラー
 *
 * アプリは起動時に <link rel="manifest"> を選択中の配色のものへ差し替える
 * （shared/bootTheme.cjs / src/App.jsx）。ホーム画面へ追加した時点の配色で
 * アイコン・ステータスバー色・スプラッシュの地色が決まる。
 *
 * 中身は shared/pwaTheme.cjs の buildManifest() が唯一の出どころで、
 * vite.config.js が作る既定の manifest.webmanifest と同じ関数から生成される。
 */
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { SCHEME_KEYS, PWA_SCHEMES, buildManifest, manifestPathFor } = require_('../shared/pwaTheme.cjs');

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '../public');

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

for (const key of SCHEME_KEYS) {
  // manifestPathFor は先頭が '/' のURLパスなので、ファイル名だけ取り出す
  const file = manifestPathFor(key).replace(/^\//, '');
  const json = JSON.stringify(buildManifest(key), null, 2) + '\n';
  writeFileSync(resolve(outDir, file), json, 'utf8');
  console.log(`✓ ${file} — ${PWA_SCHEMES[key].label}（theme ${PWA_SCHEMES[key].theme} / splash ${PWA_SCHEMES[key].splash}）`);
}

console.log('manifest 生成完了');
