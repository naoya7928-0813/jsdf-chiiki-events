/**
 * SVG アイコンから PNG アイコンを生成するスクリプト
 * 実行: node scripts/generate-icons.mjs
 *       または npm run build 時に自動実行
 *
 * 生成ファイル:
 *   public/icons/icon-192.png        — PWA manifest 用
 *   public/icons/icon-512.png        — PWA manifest 用 (maskable)
 *   public/icons/apple-touch-icon.png — iOS ホーム画面アイコン
 */

import sharp from 'sharp';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const svgPath   = resolve(__dirname, '../public/icons/icon.svg');
const outDir    = resolve(__dirname, '../public/icons');

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const svgBuffer = readFileSync(svgPath);

const targets = [
  { name: 'icon-192.png',         size: 192 },
  { name: 'icon-512.png',         size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
];

await Promise.all(
  targets.map(({ name, size }) =>
    sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(resolve(outDir, name))
      .then(() => console.log(`✓ ${name} (${size}x${size})`))
  )
);

console.log('アイコン生成完了');
