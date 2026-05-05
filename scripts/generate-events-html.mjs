/**
 * public/data/events.json から AIクローラー向け静的 HTML を生成する
 * 実行: node scripts/generate-events-html.mjs
 * ビルドおよびスクレイプ完了後に自動実行される
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SITE_URL = 'https://jsdf-chiiki-events.vercel.app';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EVENTS_JSON = join(__dirname, '../public/data/events.json');
const OUTPUT_HTML = join(__dirname, '../public/events.html');

// 地本名マッピング
const PREF_LABELS = {
  sapporo:   '札幌',    asahikawa: '旭川',  obihiro:   '帯広',
  hakodate:  '函館',    miyagi:    '宮城',  aomori:    '青森',
  iwate:     '岩手',    yamagata:  '山形',  fukushima: '福島',
  akita:     '秋田',    kanagawa:  '神奈川', tokyo:    '東京',
  saitama:   '埼玉',    gunma:     '群馬',  tochigi:   '栃木',
  ibaraki:   '茨城',    chiba:     '千葉',  niigata:   '新潟',
  toyama:    '富山',    ishikawa:  '石川',  fukui:     '福井',
  yamanashi: '山梨',    nagano:    '長野',  gifu:      '岐阜',
  shizuoka:  '静岡',    aichi:     '愛知',  mie:       '三重',
  shiga:     '滋賀',    kyoto:     '京都',  osaka:     '大阪',
  hyogo:     '兵庫',    nara:      '奈良',  wakayama:  '和歌山',
  ehime:     '愛媛',    kagawa:    '香川',  kochi:     '高知',
  tokushima: '徳島',    tottori:   '鳥取',  shimane:   '島根',
  okayama:   '岡山',    hiroshima: '広島',  yamaguchi: '山口',
  fukuoka:   '福岡',    saga:      '佐賀',  nagasaki:  '長崎',
  kumamoto:  '熊本',    oita:      '大分',  miyazaki:  '宮崎',
  kagoshima: '鹿児島',  okinawa:   '沖縄',
};

if (!existsSync(EVENTS_JSON)) {
  console.log('[generate-events-html] events.json が見つかりません。スキップします。');
  process.exit(0);
}

const data = JSON.parse(readFileSync(EVENTS_JSON, 'utf8'));

// 全イベントをフラットに収集
const allEvents = [];
for (const [pref, events] of Object.entries(data)) {
  if (!Array.isArray(events)) continue;
  const label = PREF_LABELS[pref] ?? pref;
  for (const ev of events) {
    allEvents.push({ ...ev, prefLabel: label });
  }
}
allEvents.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));

const total = allEvents.length;
const updatedAt = data.updatedAt ?? '不明';

// 都道府県ごとにグループ化
const byPref = {};
for (const ev of allEvents) {
  if (!byPref[ev.prefLabel]) byPref[ev.prefLabel] = [];
  byPref[ev.prefLabel].push(ev);
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const sections = Object.entries(byPref).map(([label, events]) => {
  const rows = events.map(ev => {
    const dateDisplay = ev.endDate
      ? `${esc(ev.date)}（${esc(ev.weekday)}）〜${esc(ev.endDate)}（${esc(ev.endWeekday||'')}）`
      : `${esc(ev.date)}（${esc(ev.weekday)}）`;
    const parts = [
      `<li>`,
      `<time datetime="${esc(ev.date)}">${dateDisplay}</time>`,
      ` ／ <strong>${esc(ev.title)}</strong>`,
      ev.category ? ` ／ カテゴリ：${esc(ev.category)}` : '',
      ev.place    ? ` ／ 会場：${esc(ev.place)}`    : '',
      ev.deadline ? ` ／ 締切：${esc(ev.deadline)}`  : '',
      ev.tag && ev.tag !== '応募終了' ? ` ／ ${esc(ev.tag)}` : '',
      `</li>`,
    ].join('');
    return parts;
  }).join('\n      ');

  return `  <section>
    <h2>${esc(label)}地方協力本部（${events.length}件）</h2>
    <ul>
      ${rows}
    </ul>
  </section>`;
}).join('\n\n');

const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>自衛隊地本イベント一覧</title>
  <meta name="description" content="全国の自衛隊地方協力本部（地本）が開催する予定のイベント情報一覧です。説明会・記念行事・体験イベントなど。" />
  <meta name="robots" content="index, follow" />
  <meta property="og:title" content="自衛隊地本イベント一覧" />
  <meta property="og:description" content="全国の自衛隊地方協力本部のイベント情報。開催日・会場・カテゴリを掲載。" />
  <meta property="og:url" content="https://jsdf-chiiki-events.vercel.app/events.html" />
  <style>
    body { font-family: sans-serif; max-width: 900px; margin: 0 auto; padding: 16px; line-height: 1.7; }
    h1 { font-size: 1.4em; }
    h2 { font-size: 1.1em; margin-top: 2em; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
    ul { padding-left: 1.2em; }
    li { margin: 6px 0; font-size: 0.95em; }
    time { color: #555; }
    .meta { color: #666; font-size: 0.85em; margin-bottom: 1.5em; }
    a { color: #0b2545; }
  </style>
</head>
<body>
  <h1>自衛隊地方協力本部 イベント一覧</h1>
  <p class="meta">
    データ更新日時：${esc(updatedAt)}　／　合計 ${total} 件<br />
    アプリ版：<a href="https://jsdf-chiiki-events.vercel.app/">https://jsdf-chiiki-events.vercel.app/</a><br />
    JSONデータ：<a href="https://jsdf-chiiki-events.vercel.app/data/events.json">/data/events.json</a>
  </p>

${sections}

  <footer>
    <p class="meta" style="margin-top:3em">
      本ページは自衛隊地方協力本部の公式サイトから取得した情報を自動集約したものです。<br />
      最新・正確な情報は各地本公式サイトでご確認ください。
    </p>
  </footer>
</body>
</html>
`;

writeFileSync(OUTPUT_HTML, html, 'utf8');
console.log(`[generate-events-html] ${OUTPUT_HTML} を生成しました（${total} 件）`);

// sitemap.xml の lastmod を現在日時で更新
const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const sitemapPath = join(__dirname, '../public/sitemap.xml');
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_URL}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${SITE_URL}/events.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${SITE_URL}/data/events.json</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>
</urlset>
`;
writeFileSync(sitemapPath, sitemap, 'utf8');
console.log(`[generate-events-html] ${sitemapPath} を更新しました（lastmod: ${today}）`);
