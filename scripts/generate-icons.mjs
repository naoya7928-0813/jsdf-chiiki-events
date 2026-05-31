/**
 * SVG アイコンから PNG アイコンを生成するスクリプト
 * 実行: node scripts/generate-icons.mjs
 *       または npm run build 時に自動実行
 *
 * 生成ファイル:
 *   public/icons/icon-192.png                  — PWA manifest 用 (JGSDF色)
 *   public/icons/icon-512.png                  — PWA manifest 用 maskable (JGSDF色)
 *   public/icons/apple-touch-icon.png          — iOS デフォルト (JGSDF色)
 *   public/icons/apple-touch-icon-jgsdf.png    — 陸上自衛隊カラー
 *   public/icons/apple-touch-icon-jmsdf.png    — 海上自衛隊カラー
 *   public/icons/apple-touch-icon-jasdf.png    — 航空自衛隊カラー
 */

import sharp from 'sharp';
import { existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir    = resolve(__dirname, '../public/icons');

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const SCHEMES = {
  jgsdf: { bg: '#3a4130', label: '陸上自衛隊' },
  jmsdf: { bg: '#0b2545', label: '海上自衛隊' },
  jasdf: { bg: '#2a4a6b', label: '航空自衛隊' },
};

function buildSvg(bg) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="110" fill="${bg}"/>
  <circle cx="256" cy="248" r="180" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="4"/>
  <circle cx="256" cy="248" r="134" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="2"/>
  <text x="256" y="308"
    text-anchor="middle"
    font-family="'Hiragino Mincho ProN','Yu Mincho','游明朝','Noto Serif JP',serif"
    font-size="168"
    font-weight="700"
    fill="#ffffff"
    letter-spacing="-4">地</text>
  <text x="256" y="390"
    text-anchor="middle"
    font-family="'SF Mono','IBM Plex Mono',ui-monospace,monospace"
    font-size="36"
    font-weight="500"
    fill="rgba(255,255,255,0.65)"
    letter-spacing="8">JSDF</text>
</svg>`);
}

const tasks = [];

// 各スキームの apple-touch-icon を生成
for (const [key, { bg, label }] of Object.entries(SCHEMES)) {
  const svg = buildSvg(bg);
  tasks.push(
    sharp(svg)
      .resize(180, 180)
      .png()
      .toFile(resolve(outDir, `apple-touch-icon-${key}.png`))
      .then(() => console.log(`✓ apple-touch-icon-${key}.png (180x180) — ${label}`))
  );
}

// デフォルト apple-touch-icon (JGSDF色)
const defaultSvg = buildSvg(SCHEMES.jgsdf.bg);
tasks.push(
  sharp(defaultSvg)
    .resize(180, 180)
    .png()
    .toFile(resolve(outDir, 'apple-touch-icon.png'))
    .then(() => console.log('✓ apple-touch-icon.png (180x180) — デフォルト (JGSDF)'))
);

// PWA manifest 用アイコン (JGSDF色)
tasks.push(
  sharp(defaultSvg).resize(192, 192).png()
    .toFile(resolve(outDir, 'icon-192.png'))
    .then(() => console.log('✓ icon-192.png (192x192)'))
);
tasks.push(
  sharp(defaultSvg).resize(512, 512).png()
    .toFile(resolve(outDir, 'icon-512.png'))
    .then(() => console.log('✓ icon-512.png (512x512)'))
);

await Promise.all(tasks);
console.log('アイコン生成完了');
