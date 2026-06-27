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

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { REGIONS } from '../src/data/regionMap.js';

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

// クローラー向けHTMLの軽量化: タグ間の純粋な空白（インデント/改行）だけを除去する。
// <script>(JSON-LD)・<style> ブロックは中身を保護し、その外側だけを圧縮する
// （JSON値に ">  <" 等が含まれても壊さないため）。
function minifyHtml(h) {
  const parts = h.split(/(<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>)/i);
  return parts
    .map((seg, i) => (i % 2 === 0 ? seg.replace(/>\s+</g, '><') : seg))
    .join('')
    .trim() + '\n';
}

// 地本キー → 所属地域（地域名・同地域の地本リスト）の逆引き
const REGION_OF = {};
for (const region of REGIONS) {
  for (const pref of region.prefectures) {
    REGION_OF[pref.id] = region;
  }
}

// updatedAt（"2026/06/16 23:23"）→ ISO 日付（"2026-06-16"）。sitemap lastmod 用。
function toIsoDate(s) {
  const m = String(s ?? '').match(/(\d{4})\D(\d{1,2})\D(\d{1,2})/);
  if (!m) return today;
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

/** 同一地域内の地本へのクロスリンク（内部リンク・回遊性向上） */
function regionNav(prefKey) {
  const region = REGION_OF[prefKey];
  if (!region) return '';
  const links = region.prefectures.map(p =>
    p.id === prefKey
      ? `<strong>${esc(p.label)}</strong>`
      : `<a href="/events/${p.id}.html">${esc(p.label)}</a>`
  ).join('　');
  return `<nav class="region-nav"><b>${esc(region.label)}地方の地本：</b>${links}</nav>`;
}

/** 全国の地本ページインデックス（地域別・全ページを内部リンクで網羅） */
function nationalIndex() {
  return REGIONS.map(region => {
    const links = region.prefectures
      .map(p => `<a href="/events/${p.id}.html">${esc(p.label)}</a>`)
      .join('　');
    return `  <section class="idx"><h3>${esc(region.label)}</h3><p>${links}</p></section>`;
  }).join('\n');
}

/** BreadcrumbList 構造化データ */
function breadcrumbSchema(prefLabel, prefKey) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '自衛隊地本イベント一覧', item: `${SITE_URL}/events.html` },
      { '@type': 'ListItem', position: 2, name: `${prefLabel}地方協力本部`, item: `${SITE_URL}/events/${prefKey}.html` },
    ],
  };
}

/** 都道府県別ページの常設（エバーグリーン）本文。thin content 対策の固有コンテンツ。 */
function prefEvergreen(prefLabel) {
  const regionLabel = REGION_OF[Object.keys(PREF_LABELS).find(k => PREF_LABELS[k] === prefLabel)]?.label ?? '';
  return `  <section>
    <p>${esc(prefLabel)}地方協力本部（通称「${esc(prefLabel)}地本」）は、${esc(regionLabel)}地方の${esc(prefLabel)}を担当する自衛隊の地域窓口です。
    このページでは、${esc(prefLabel)}地本および管内の駐屯地・基地・分屯地が公開する自衛隊イベント情報を、非公式に自動集約して掲載しています。
    対象となるのは、入隊・採用を検討している方向けの<strong>自衛隊説明会・採用イベント</strong>、どなたでも参加できる<strong>駐屯地／基地の一般公開・記念行事</strong>、
    <strong>体験搭乗・体験航海</strong>、<strong>音楽演奏会</strong>などです。</p>
  </section>
  <section>
    <h2>${esc(prefLabel)}の自衛隊イベントに関するよくある質問</h2>
    <h3>${esc(prefLabel)}ではどのような自衛隊イベントがありますか？</h3>
    <p>${esc(prefLabel)}地本では、自衛官の募集・採用に関する説明会や個別相談会のほか、陸上・海上・航空自衛隊の駐屯地や基地で行われる一般公開・記念行事、装備品の展示、音楽演奏会など、一般の方が参加できるイベントも実施されます。</p>
    <h3>参加に申し込みは必要ですか？</h3>
    <p>イベントによって異なります。説明会や体験イベントは事前予約・事前申込が必要なことが多く、記念行事や一般公開は申込不要で参加できる場合が一般的です。参加可否・申込方法・中止や変更などの最新情報は、必ず各イベントの公式ページでご確認ください。</p>
  </section>`;
}

/** FAQ の構造化データ（FAQPage） */
function faqSchema(prefLabel) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: `${prefLabel}ではどのような自衛隊イベントがありますか？`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `${prefLabel}地方協力本部では、自衛官の募集・採用に関する説明会や個別相談会のほか、陸上・海上・航空自衛隊の駐屯地や基地で行われる一般公開・記念行事、装備品の展示、音楽演奏会など、一般の方が参加できるイベントも実施されます。`,
        },
      },
      {
        '@type': 'Question',
        name: '参加に申し込みは必要ですか？',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'イベントによって異なります。説明会や体験イベントは事前予約・事前申込が必要なことが多く、記念行事や一般公開は申込不要で参加できる場合が一般的です。最新情報は各イベントの公式ページでご確認ください。',
        },
      },
    ],
  };
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

// JSON-LD は整形(インデント)不要。クローラーは圧縮JSONも同等に解釈するため非整形で出力し軽量化。
const allJsonLd = JSON.stringify(
  allEvents.map(ev => toEventSchema(ev, ev.prefLabel))
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

  <section style="margin-top:3em">
    <h2>都道府県別の自衛隊地本イベントページ</h2>
    <p class="meta">各地方協力本部のイベント情報は、以下の都道府県別ページでも確認できます。</p>
${nationalIndex()}
  </section>

  <footer>
    <p class="meta" style="margin-top:3em">
      本ページは自衛隊地方協力本部の公式サイトから取得した情報を自動集約したものです。<br />
      最新・正確な情報は各地本公式サイトでご確認ください。
    </p>
  </footer>
</body>
</html>
`;

writeFileSync(OUTPUT_HTML, minifyHtml(mainHtml), 'utf8');
console.log(`[generate-events-html] events.html を生成（${allEvents.length} 件）`);

// ── 都道府県別ページ events/<pref>.html を生成 ──────────────────
// イベントが無い県も常設のエバーグリーンページとして生成し、URL を安定させる
// （孤立ファイル・thin content による「インデックス未登録」を防ぐ）。

const lastmod = toIsoDate(updatedAt);

for (const [prefKey, prefLabel] of Object.entries(PREF_LABELS)) {
  const events = byPrefKey[prefKey] ?? [];
  const hasEvents = events.length > 0;

  // 構造化データ: パンくず + FAQ（常時）+ Event（イベントがある時のみ）
  const schemas = [breadcrumbSchema(prefLabel, prefKey), faqSchema(prefLabel)];
  if (hasEvents) {
    for (const ev of events) schemas.push(toEventSchema(ev, prefLabel));
  }
  const prefJsonLd = JSON.stringify(schemas);

  const countNote = hasEvents
    ? `説明会・体験イベント・駐屯地一般公開・記念行事など ${events.length} 件を掲載`
    : '説明会・体験イベント・駐屯地一般公開・記念行事などの情報を掲載';

  const eventBlock = hasEvents
    ? `  <p class="meta">最終更新：${esc(updatedAt)}　／　${events.length} 件掲載</p>
  <ul>
    ${renderRows(events)}
  </ul>`
    : `  <p class="meta">最終更新：${esc(updatedAt)}</p>
  <p>現在、${esc(prefLabel)}地本で公開中の自衛隊イベント情報はありません。新しいイベントが公開され次第、自動で掲載されます。
  直近の開催予定は、本サイトの<a href="/events.html">全国一覧</a>や近隣県のページ、または${esc(prefLabel)}地方協力本部の公式サイトでご確認ください。</p>`;

  const prefHtml = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(prefLabel)}の自衛隊イベント情報 | ${esc(prefLabel)}地方協力本部（地本）説明会・記念行事【非公式まとめ】</title>
  <meta name="description" content="${esc(prefLabel)}地方協力本部（${esc(prefLabel)}地本）が公開する自衛隊イベント情報。${countNote}（${esc(updatedAt)} 更新）。陸・海・空自衛隊の説明会・採用イベント・駐屯地／基地の一般公開・体験搭乗を非公式にまとめています。" />
  <meta name="keywords" content="${esc(prefLabel)} 自衛隊 イベント,自衛隊 説明会 ${esc(prefLabel)},${esc(prefLabel)}地方協力本部,${esc(prefLabel)}地本,駐屯地 一般公開 ${esc(prefLabel)},記念行事,体験搭乗,自衛官募集 ${esc(prefLabel)}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${SITE_URL}/events/${prefKey}.html" />
  <meta property="og:title" content="${esc(prefLabel)}の自衛隊イベント情報【非公式まとめ】" />
  <meta property="og:description" content="${esc(prefLabel)}地方協力本部の自衛隊イベント情報。開催日・会場・カテゴリを掲載。" />
  <meta property="og:url" content="${SITE_URL}/events/${prefKey}.html" />
  <meta property="og:type" content="website" />
  <meta property="og:image" content="${SITE_URL}/icons/icon-512.png" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${esc(prefLabel)}の自衛隊イベント情報【非公式まとめ】" />
  <meta name="twitter:description" content="${esc(prefLabel)}地方協力本部の自衛隊イベント情報。" />
  <meta name="twitter:image" content="${SITE_URL}/icons/icon-512.png" />
  <script type="application/ld+json">
${prefJsonLd}
  </script>
  <style>
    body { font-family: sans-serif; max-width: 900px; margin: 0 auto; padding: 16px; line-height: 1.7; }
    h1 { font-size: 1.4em; }
    h2 { font-size: 1.15em; margin-top: 2em; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
    h3 { font-size: 1em; margin: 1.2em 0 0.3em; }
    ul { padding-left: 1.2em; }
    li { margin: 6px 0; font-size: 0.95em; }
    time { color: #555; }
    .meta { color: #666; font-size: 0.85em; margin-bottom: 1.5em; }
    a { color: #0b2545; }
    nav { margin-bottom: 1.5em; font-size: 0.9em; }
    .region-nav { background:#f4f6fa; border-radius:4px; padding:8px 12px; line-height:2; }
  </style>
</head>
<body>
  <nav><a href="/events.html">← 全国の自衛隊イベント一覧</a>　／　<a href="/">アプリ版（PWA）</a></nav>
  <h1>${esc(prefLabel)}の自衛隊イベント情報（${esc(prefLabel)}地方協力本部）</h1>
${prefEvergreen(prefLabel)}
  <h2>${esc(prefLabel)}の開催予定・最新イベント</h2>
${eventBlock}
  ${regionNav(prefKey)}
  <footer>
    <p class="meta" style="margin-top:3em">
      ⚠️ 当サイトは有志による非公式サイトです。防衛省・自衛隊および${esc(prefLabel)}地方協力本部とは直接関係ありません。<br />
      本ページは${esc(prefLabel)}地方協力本部の公式サイトから取得した情報を自動集約したものです。参加・申込・中止・変更などの最新・正確な情報は公式サイトでご確認ください。
    </p>
  </footer>
</body>
</html>
`;

  writeFileSync(join(EVENTS_DIR, `${prefKey}.html`), minifyHtml(prefHtml), 'utf8');
  console.log(`[generate-events-html] events/${prefKey}.html を生成（${hasEvents ? events.length : 0} 件）`);
}

// 孤立ファイルの掃除: 現在の対応都道府県に無い古い HTML を削除
const validFiles = new Set(Object.keys(PREF_LABELS).map(k => `${k}.html`));
for (const f of readdirSync(EVENTS_DIR)) {
  if (f.endsWith('.html') && !validFiles.has(f)) {
    unlinkSync(join(EVENTS_DIR, f));
    console.log(`[generate-events-html] 孤立ファイル削除: events/${f}`);
  }
}

// ── sitemap.xml を更新 ──────────────────────────────────────────
// 全都道府県ページを掲載。非ページの events.json は含めない（インデックス未登録の原因）。

const prefUrls = Object.keys(PREF_LABELS).map(k => `  <url>
    <loc>${SITE_URL}/events/${k}.html</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`).join('\n');

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_URL}/</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${SITE_URL}/events.html</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
${prefUrls}
</urlset>
`;

const sitemapPath = join(__dirname, '../public/sitemap.xml');
writeFileSync(sitemapPath, sitemap, 'utf8');
console.log(`[generate-events-html] sitemap.xml を更新（${Object.keys(PREF_LABELS).length + 2} URL）`);
