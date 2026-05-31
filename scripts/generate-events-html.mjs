/**
 * public/data/events.json から静的 HTML を生成する
 * 実行: node scripts/generate-events-html.mjs
 * ビルドおよびスクレイプ完了後に自動実行される
 *
 * 生成物:
 *   public/events.html          — 全イベント一覧（検索エンジン向け）
 *   public/events/<pref>.html   — 都道府県別ページ（ロングテール SEO）
 *   public/sitemap.xml          — 全ページ URL リスト
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SITE_URL = 'https://jsdf-chiiki-events.vercel.app';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EVENTS_JSON = join(__dirname, '../public/data/events.json');
const OUTPUT_HTML = join(__dirname, '../public/events.html');
const EVENTS_DIR  = join(__dirname, '../public/events');

// 地本名マッピング（英字キー → 表示名）
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

mkdirSync(EVENTS_DIR, { recursive: true });

const data = JSON.parse(readFileSync(EVENTS_JSON, 'utf8'));
const updatedAt = data.updatedAt ?? '不明';
const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

// 全イベントをフラットに収集
const allEvents = [];
for (const [pref, events] of Object.entries(data)) {
  if (!Array.isArray(events)) continue;
  const label = PREF_LABELS[pref] ?? pref;
  for (const ev of events) {
    allEvents.push({ ...ev, prefKey: pref, prefLabel: label });
  }
}
allEvents.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));

// 都道府県ごとにグループ化
const byPref = {};
for (const ev of allEvents) {
  if (!byPref[ev.prefLabel]) byPref[ev.prefLabel] = [];
  byPref[ev.prefLabel].push(ev);
}

// prefKey でグループ化（ファイル名生成用）
const byPrefKey = {};
for (const ev of allEvents) {
  if (!byPrefKey[ev.prefKey]) byPrefKey[ev.prefKey] = [];
  byPrefKey[ev.prefKey].push(ev);
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Schema.org Event オブジェクトを生成 */
function toEventSchema(ev, prefLabel) {
  const obj = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: ev.title,
    startDate: ev.date,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    organizer: {
      '@type': 'Organization',
      name: `${prefLabel}地方協力本部`,
    },
    url: ev.url || SITE_URL,
    image: [
      `${SITE_URL}/icons/icon-512.png`
    ],
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'JPY',
      availability: 'https://schema.org/InStock',
      url: ev.url || SITE_URL
    }
  };
  if (ev.endDate) obj.endDate = ev.endDate;

  // location is a required property for Google Event rich results.
  const locationObj = {
    '@type': 'Place',
    name: ev.place || `${prefLabel}地方協力本部`,
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'JP',
      addressRegion: prefLabel
    }
  };
  if (ev.address) {
    locationObj.address.streetAddress = ev.address;
  }
  obj.location = locationObj;

  const desc = [ev.category, ev.ageRequirement, ev.notes].filter(Boolean).join('。');
  obj.description = desc || ev.title;
  return obj;
}

/** イベントリスト HTML（<li> 要素）を生成 */
function renderRows(events) {
  return events.map(ev => {
    const dateDisplay = ev.endDate
      ? `${esc(ev.date)}（${esc(ev.weekday)}）〜${esc(ev.endDate)}（${esc(ev.endWeekday || '')}）`
      : `${esc(ev.date)}（${esc(ev.weekday)}）`;
    return [
      `<li>`,
      `<time datetime="${esc(ev.date)}">${dateDisplay}</time>`,
      ` ／ <strong>${esc(ev.title)}</strong>`,
      ev.category ? ` ／ カテゴリ：${esc(ev.category)}` : '',
      ev.place    ? ` ／ 会場：${esc(ev.place)}`    : '',
      ev.deadline ? ` ／ 締切：${esc(ev.deadline)}`  : '',
      ev.tag && ev.tag !== '応募終了' ? ` ／ ${esc(ev.tag)}` : '',
      ev.url ? ` ／ <a href="${esc(ev.url)}" target="_blank" rel="noopener noreferrer">公式ページで確認</a>` : '',
      `</li>`,
    ].join('');
  }).join('\n      ');
}

// ── 全イベント一覧 events.html を生成 ───────────────────────────

const sections = Object.entries(byPref).map(([label, events]) => {
  const prefKey = events[0]?.prefKey ?? '';
  const prefLink = prefKey ? ` <a href="/events/${prefKey}.html">（${label}のみ表示）</a>` : '';
  return `  <section>
    <h2>${esc(label)}地方協力本部（${events.length}件）${prefLink}</h2>
    <ul>
      ${renderRows(events)}
    </ul>
  </section>`;
}).join('\n\n');

const allJsonLd = JSON.stringify(
  allEvents.map(ev => toEventSchema(ev, ev.prefLabel)),
  null, 2
);

const mainHtml = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>自衛隊地方協力本部（地本）イベント一覧 | 全国の説明会・記念行事・体験イベント【非公式まとめ】</title>
  <meta name="description" content="全国の自衛隊地方協力本部（地本）が公開するイベントをまとめた非公式サービスです。陸・海・空自衛隊の説明会・記念行事・駐屯地一般公開・体験搭乗など ${allEvents.length} 件を掲載（${esc(updatedAt)} 更新）。" />
  <meta name="keywords" content="自衛隊 イベント,地方協力本部,地本,自衛隊説明会,駐屯地 一般公開,自衛隊記念行事,体験搭乗,陸上自衛隊,海上自衛隊,航空自衛隊,自衛官募集,自衛隊 体験,記念行事" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${SITE_URL}/events.html" />
  <meta property="og:title" content="自衛隊地本イベント一覧" />
  <meta property="og:description" content="全国の自衛隊地方協力本部のイベント情報。開催日・会場・カテゴリを掲載。" />
  <meta property="og:url" content="${SITE_URL}/events.html" />
  <meta property="og:type" content="website" />
  <meta property="og:image" content="${SITE_URL}/icons/icon-512.png" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="自衛隊地本イベント一覧" />
  <meta name="twitter:description" content="全国の自衛隊地方協力本部のイベント情報。開催日・会場・カテゴリを掲載。" />
  <meta name="twitter:image" content="${SITE_URL}/icons/icon-512.png" />
  <script type="application/ld+json">
${allJsonLd}
  </script>
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
  <h1>自衛隊地方協力本部（地本）イベント一覧</h1>
  <p>全国の自衛隊地方協力本部が公開するイベントをまとめた非公式サービスです。
  陸上・海上・航空自衛隊の説明会、記念行事、駐屯地・基地の一般公開、体験搭乗など各種イベントを都道府県別に掲載しています。</p>
  <p class="meta">
    最終更新：${esc(updatedAt)}　／　全 ${allEvents.length} 件掲載<br />
    アプリ版（PWA）：<a href="${SITE_URL}/">${SITE_URL}/</a><br />
    開発者向けJSONデータ：<a href="${SITE_URL}/data/events.json">/data/events.json</a>
  </p>
  <p class="meta" style="border:1px solid #ccc;border-radius:4px;padding:8px 12px;background:#fffbe6">
    ⚠️ 当サイトは有志による非公式サイトです。防衛省・自衛隊および各地方協力本部とは直接関係ありません。<br />
    参加・申込・中止・変更などの最新情報は、必ず各地方協力本部の公式ページでご確認ください。
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

writeFileSync(OUTPUT_HTML, mainHtml, 'utf8');
console.log(`[generate-events-html] events.html を生成（${allEvents.length} 件）`);

// ── 都道府県別ページ events/<pref>.html を生成 ──────────────────

for (const [prefKey, prefLabel] of Object.entries(PREF_LABELS)) {
  const events = byPrefKey[prefKey];
  if (!events || events.length === 0) continue;

  const prefJsonLd = JSON.stringify(
    events.map(ev => toEventSchema(ev, prefLabel)),
    null, 2
  );

  const prefHtml = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(prefLabel)}地方協力本部 イベント一覧 | 自衛隊地本イベント情報【非公式まとめ】</title>
  <meta name="description" content="${esc(prefLabel)}地方協力本部が公開する自衛隊イベント情報。説明会・体験イベント・駐屯地一般公開・記念行事など ${events.length} 件を掲載（${esc(updatedAt)} 更新）。" />
  <meta name="keywords" content="${esc(prefLabel)},${esc(prefLabel)}地方協力本部,自衛隊 ${esc(prefLabel)},自衛隊イベント ${esc(prefLabel)},地本,説明会,記念行事,駐屯地 一般公開,体験搭乗,自衛官募集" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${SITE_URL}/events/${prefKey}.html" />
  <meta property="og:title" content="${esc(prefLabel)}地方協力本部 イベント一覧" />
  <meta property="og:description" content="${esc(prefLabel)}地方協力本部の自衛隊イベント情報。開催日・会場・カテゴリを掲載。" />
  <meta property="og:url" content="${SITE_URL}/events/${prefKey}.html" />
  <meta property="og:type" content="website" />
  <meta property="og:image" content="${SITE_URL}/icons/icon-512.png" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${esc(prefLabel)}地方協力本部 イベント一覧" />
  <meta name="twitter:description" content="${esc(prefLabel)}地方協力本部の自衛隊イベント情報。${events.length} 件掲載。" />
  <meta name="twitter:image" content="${SITE_URL}/icons/icon-512.png" />
  <script type="application/ld+json">
${prefJsonLd}
  </script>
  <style>
    body { font-family: sans-serif; max-width: 900px; margin: 0 auto; padding: 16px; line-height: 1.7; }
    h1 { font-size: 1.4em; }
    ul { padding-left: 1.2em; }
    li { margin: 6px 0; font-size: 0.95em; }
    time { color: #555; }
    .meta { color: #666; font-size: 0.85em; margin-bottom: 1.5em; }
    a { color: #0b2545; }
    nav { margin-bottom: 1.5em; font-size: 0.9em; }
  </style>
</head>
<body>
  <nav><a href="/events.html">← 全国一覧に戻る</a>　／　<a href="/">アプリ版（PWA）</a></nav>
  <h1>${esc(prefLabel)}地方協力本部 イベント一覧</h1>
  <p>${esc(prefLabel)}地方協力本部が公開する自衛隊イベント情報のまとめです（非公式サービス）。</p>
  <p class="meta">最終更新：${esc(updatedAt)}　／　${events.length} 件掲載</p>
  <ul>
    ${renderRows(events)}
  </ul>
  <footer>
    <p class="meta" style="margin-top:3em">
      本ページは${esc(prefLabel)}地方協力本部の公式サイトから取得した情報を自動集約したものです。<br />
      最新・正確な情報は公式サイトでご確認ください。
    </p>
  </footer>
</body>
</html>
`;

  writeFileSync(join(EVENTS_DIR, `${prefKey}.html`), prefHtml, 'utf8');
  console.log(`[generate-events-html] events/${prefKey}.html を生成（${events.length} 件）`);
}

// ── sitemap.xml を更新 ──────────────────────────────────────────

const prefWithEvents = Object.keys(PREF_LABELS).filter(k => byPrefKey[k]?.length > 0);

const prefUrls = prefWithEvents.map(k => `  <url>
    <loc>${SITE_URL}/events/${k}.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`).join('\n');

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
${prefUrls}
  <url>
    <loc>${SITE_URL}/data/events.json</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.5</priority>
  </url>
</urlset>
`;

const sitemapPath = join(__dirname, '../public/sitemap.xml');
writeFileSync(sitemapPath, sitemap, 'utf8');
console.log(`[generate-events-html] sitemap.xml を更新（${prefWithEvents.length + 3} URL）`);
