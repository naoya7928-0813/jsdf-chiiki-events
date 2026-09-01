/**
 * SVG アイコンから PNG アイコンを生成するスクリプト
 * 実行: node scripts/generate-icons.mjs
 *       または npm run build 時に自動実行
 *
 * 生成ファイル:
 *   public/icons/icon-192.png                  — favicon / 通知アイコン (JGSDF色)
 *   public/icons/icon-512.png                  — OGP・共有画像 (JGSDF色)
 *   public/icons/icon-<scheme>-192.png         — PWA manifest 用（陸/海/空）
 *   public/icons/icon-<scheme>-512.png         — PWA manifest 用 maskable（陸/海/空）
 *   public/icons/shortcut-<scheme>-<key>-96.png — ホーム画面ショートカット（陸/海/空 × 4種）
 *   public/icons/apple-touch-icon.png          — iOS デフォルト (JGSDF色)
 *   public/icons/apple-touch-icon-jgsdf.png    — 陸上自衛隊カラー
 *   public/icons/apple-touch-icon-jmsdf.png    — 海上自衛隊カラー
 *   public/icons/apple-touch-icon-jasdf.png    — 航空自衛隊カラー
 *   public/icons/icon-admin-192.png            — 運営用 PWA (「地」下に「運営用」)
 *   public/icons/icon-admin-512.png            — 運営用 PWA maskable
 *   public/icons/apple-touch-icon-admin.png    — 運営用 iOS
 */

import sharp from 'sharp';
import { existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir    = resolve(__dirname, '../public/icons');

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

// 配色は shared/pwaTheme.cjs が唯一の出どころ（manifest と同じ色を使う）
const require_ = createRequire(import.meta.url);
const { PWA_SCHEMES, SHORTCUTS } = require_('../shared/pwaTheme.cjs');
const SCHEMES = Object.fromEntries(
  Object.entries(PWA_SCHEMES).map(([k, v]) => [k, { bg: v.theme, label: v.label }])
);

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

// 運営用アイコン: 通常と同じ意匠で「地」の真下に「運営用」を入れる（通常版は変更しない）
function buildAdminSvg(bg) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="110" fill="${bg}"/>
  <circle cx="256" cy="248" r="180" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="4"/>
  <circle cx="256" cy="248" r="134" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="2"/>
  <text x="256" y="268"
    text-anchor="middle"
    font-family="'Hiragino Mincho ProN','Yu Mincho','游明朝','Noto Serif JP',serif"
    font-size="150"
    font-weight="700"
    fill="#ffffff"
    letter-spacing="-4">地</text>
  <text x="256" y="372"
    text-anchor="middle"
    font-family="'Hiragino Sans','Yu Gothic','游ゴシック','Noto Sans JP',sans-serif"
    font-size="62"
    font-weight="700"
    fill="#ffffff"
    letter-spacing="2">運営用</text>
</svg>`);
}

// ── ホーム画面ショートカットのアイコン ──────────────────────────
// 図案は src/components/Icons.jsx の線画と同じパス（アプリ内と見た目を揃える）。
// 24x24 の viewBox を 56px 相当へ拡大し、96x96 の角丸タイルの中央へ置く。
const SHORTCUT_GLYPHS = {
  // cal（イベント一覧）
  list: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/>',
  // star（お気に入り）
  favorites: '<path d="M12 3l2.7 5.5 6 .9-4.3 4.2 1 6L12 17l-5.4 2.6 1-6L3.3 9.4l6-.9L12 3z"/>',
  // bell（お知らせ）
  notifications: '<path d="M6 16V11a6 6 0 1112 0v5l1.5 2h-15L6 16z"/><path d="M10 21a2 2 0 004 0"/>',
  // gear（設定）
  settings: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5l1.4 2.3 2.7-.5.3 2.7 2.4 1.2-1 2.5 1 2.5-2.4 1.2-.3 2.7-2.7-.5L12 21.5l-1.4-2.3-2.7.5-.3-2.7L5.2 15.8l1-2.5-1-2.5 2.4-1.2.3-2.7 2.7.5L12 2.5z"/>',
};

function buildShortcutSvg(bg, glyph) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <rect width="96" height="96" rx="22" fill="${bg}"/>
  <g transform="translate(20 20) scale(2.333)"
     fill="none" stroke="#ffffff" stroke-width="1.7"
     stroke-linecap="round" stroke-linejoin="round">${glyph}</g>
</svg>`);
}

const tasks = [];

// 運営用アイコン（デフォルト JGSDF 色・通常版と同じ背景）
const adminSvg = buildAdminSvg(SCHEMES.jgsdf.bg);
tasks.push(
  sharp(adminSvg).resize(192, 192).png()
    .toFile(resolve(outDir, 'icon-admin-192.png'))
    .then(() => console.log('✓ icon-admin-192.png (192x192) — 運営用'))
);
tasks.push(
  sharp(adminSvg).resize(512, 512).png()
    .toFile(resolve(outDir, 'icon-admin-512.png'))
    .then(() => console.log('✓ icon-admin-512.png (512x512) — 運営用'))
);
tasks.push(
  sharp(adminSvg).resize(180, 180).png()
    .toFile(resolve(outDir, 'apple-touch-icon-admin.png'))
    .then(() => console.log('✓ apple-touch-icon-admin.png (180x180) — 運営用'))
);

// 配色ごとのアイコン一式（iOS ホーム画面・PWA manifest・ショートカット）
for (const [key, { bg, label }] of Object.entries(SCHEMES)) {
  const svg = buildSvg(bg);
  tasks.push(
    sharp(svg)
      .resize(180, 180)
      .png()
      .toFile(resolve(outDir, `apple-touch-icon-${key}.png`))
      .then(() => console.log(`✓ apple-touch-icon-${key}.png (180x180) — ${label}`))
  );
  // PWA manifest 用（配色を選ぶとホーム画面のアイコンもその色になる）
  for (const size of [192, 512]) {
    tasks.push(
      sharp(svg).resize(size, size).png()
        .toFile(resolve(outDir, `icon-${key}-${size}.png`))
        .then(() => console.log(`✓ icon-${key}-${size}.png (${size}x${size}) — ${label}`))
    );
  }
  // ホーム画面ショートカット（長押しメニュー）
  for (const { key: sKey, name } of SHORTCUTS) {
    const glyph = SHORTCUT_GLYPHS[sKey];
    if (!glyph) throw new Error(`ショートカット ${sKey} の図案がありません（SHORTCUT_GLYPHS に追加してください）`);
    tasks.push(
      sharp(buildShortcutSvg(bg, glyph)).resize(96, 96).png()
        .toFile(resolve(outDir, `shortcut-${key}-${sKey}-96.png`))
        .then(() => console.log(`✓ shortcut-${key}-${sKey}-96.png (96x96) — ${label} / ${name}`))
    );
  }
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

// favicon・通知アイコン・OGP 用（PWA manifest は上の icon-<scheme>-*.png を使う）
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
