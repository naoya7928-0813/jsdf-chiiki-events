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

// ── 募集案内所・地域事務所（県ページの固有コンテンツ） ──────────────
// イベント0件の県ページがテンプレ文のみの薄い内容（実質同一ページ）になり
// Google に「クロール済み・インデックス未登録」とされるのを防ぐため、
// 県ごとに固有の実データ（地本・案内所の所在地一覧）を掲載する。
const OFFICES_JSON = join(__dirname, '../public/data/offices.json');
const officesByPref = {};
try {
  const od = JSON.parse(readFileSync(OFFICES_JSON, 'utf8'));
  for (const o of od.offices || []) {
    if (!o.pref || !o.name) continue;
    (officesByPref[o.pref] ||= []).push(o);
  }
} catch { /* offices.json が無くてもページ生成は続行 */ }

/** 県内の地本本部・募集案内所一覧セクション（無ければ空文字） */
function officeSection(prefKey, prefLabel) {
  const list = officesByPref[prefKey] || [];
  if (!list.length) return '';
  // 本部（hq）→ 案内所・事務所（名称順）
  const hq = list.filter(o => o.type === 'hq');
  const rec = list.filter(o => o.type !== 'hq')
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'ja'));
  const row = (o) => {
    const tel = o.tel ? `　TEL: <a href="tel:${esc(String(o.tel).replace(/[^\d+-]/g, ''))}">${esc(o.tel)}</a>` : '';
    const link = o.url && /^https?:\/\//.test(o.url) && o.hasOfficialPage !== false
      ? `　<a href="${esc(o.url)}" target="_blank" rel="noopener noreferrer">公式ページ</a>` : '';
    return `    <li><strong>${esc(o.name)}</strong>${o.address ? `<br />${esc(o.address)}` : ''}${tel}${link}</li>`;
  };
  return `  <h2>${esc(prefLabel)}の自衛隊 募集案内所・地域事務所</h2>
  <p class="meta">イベントの申込方法の確認や自衛官採用の相談は、最寄りの募集案内所・地域事務所でも受け付けています（受付時間等は各所へお問い合わせください）。</p>
  <ul>
${[...hq, ...rec].map(row).join('\n')}
  </ul>`;
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// <script type="application/ld+json"> へ埋め込む JSON の無害化。
// JSON.stringify は "<" をエスケープしないため、スクレイプ由来のタイトルに
// "</script>" が含まれるとタグが破壊される（格納型XSSベクトル）。
// "<" を < に置換すれば JSON としては等価のままタグ終端を防げる。
function jsonLdSafe(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
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
    // イベント個別のチラシ画像があればそれを使う（リッチリザルトの見栄え向上）。
    // 無ければサイト共通アイコンにフォールバック。
    image: [
      (typeof ev.imageUrl === 'string' && /^https?:\/\//.test(ev.imageUrl))
        ? ev.imageUrl
        : `${SITE_URL}/icons/icon-512.png`
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

// カテゴリ横断ページ（種目LP）の定義。events.html からも内部リンクするため
// ここ（events.html 生成より前）で宣言する。
const CATEGORY_TOPICS = [
  { cat: '体験',       slug: 'taiken',       h1: '自衛隊の体験イベント（体験搭乗・体験航海など）',
    kw: '体験搭乗,体験航海,自衛隊 体験,ヘリ 体験搭乗,自衛隊 体験イベント',
    lead: 'ヘリコプターや輸送機の体験搭乗、艦艇の体験航海など、自衛隊の装備を実際に体験できるイベントを全国から集約しています。体験系は人気が高く、事前申込・抽選となることが多いため、気になるイベントは早めに公式の募集要項をご確認ください。' },
  { cat: '艦艇公開',   slug: 'kantei-kokai', h1: '自衛隊の艦艇公開・一般公開（護衛艦・巡視船など）',
    kw: '艦艇公開,護衛艦 一般公開,自衛艦 公開,艦艇 見学,体験航海',
    lead: '護衛艦などの艦艇を見学できる艦艇公開イベントを全国から集約しています。停泊地での一般公開や、乗艦しての体験航海が行われることがあります。開催日・受付時間・事前申込の要否は各公式情報をご確認ください。' },
  { cat: '一般公開',   slug: 'ippan-kokai',  h1: '駐屯地・基地の一般公開',
    kw: '駐屯地 一般公開,基地 一般公開,自衛隊 一般公開,航空祭',
    lead: '駐屯地・基地の一般公開イベントを全国から集約しています。装備品展示・訓練展示・音楽演奏・子ども向け体験など、どなたでも楽しめる催しが一般的です。' },
  { cat: '記念行事',   slug: 'kinen-gyoji',  h1: '自衛隊の記念行事（創立記念・観閲式など）',
    kw: '自衛隊 記念行事,創立記念,観閲式,駐屯地祭',
    lead: '駐屯地・基地の創立記念行事や式典など、自衛隊の記念行事を全国から集約しています。観閲式や訓練展示が行われることもあります。' },
  { cat: '演奏会',     slug: 'ensokai',      h1: '自衛隊音楽隊の演奏会・コンサート',
    kw: '自衛隊 音楽隊,自衛隊 演奏会,陸上自衛隊 音楽隊 コンサート',
    lead: '陸・海・空自衛隊の音楽隊による演奏会・コンサート情報を全国から集約しています。入場無料・事前申込制のものが多くあります。' },
  { cat: '説明会',     slug: 'setsumeikai',  h1: '自衛隊の説明会・個別相談会',
    kw: '自衛隊 説明会,自衛官 募集 説明会,自衛隊 相談会',
    lead: '入隊・採用を検討している方向けの自衛隊説明会・個別相談会を全国から集約しています。多くは事前予約・事前申込制です。' },
  { cat: '採用イベント', slug: 'saiyo',       h1: '自衛官募集の採用イベント',
    kw: '自衛官 募集,自衛隊 採用イベント,自衛官候補生,一般曹候補生',
    lead: '自衛官募集に関する採用イベントを全国から集約しています。採用区分・年齢・学歴の要件は年度により異なるため、最新の募集要項を公式でご確認ください。' },
  { cat: '広報活動',   slug: 'koho',         h1: '自衛隊の広報活動・イベント',
    kw: '自衛隊 広報,自衛隊 イベント,地方協力本部 広報',
    lead: '地方協力本部・募集案内所による広報活動やイベントを全国から集約しています。' },
  { cat: '地域参加',   slug: 'chiiki',       h1: '自衛隊が参加する地域イベント・お祭り',
    kw: '自衛隊 お祭り,自衛隊 地域イベント,自衛隊 参加 イベント',
    lead: '地域のお祭りや催しに自衛隊が参加するイベントを全国から集約しています。' },
];

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
const allJsonLd = jsonLdSafe(
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
  <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />
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
    はじめての方へ：<a href="${SITE_URL}/guide.html">自衛隊イベント参加ガイド（説明会の流れ・持ち物・申込）</a><br />
    アプリ版（PWA）：<a href="${SITE_URL}/">${SITE_URL}/</a><br />
    開発者向けJSONデータ：<a href="${SITE_URL}/data/events.json">/data/events.json</a>
  </p>
  <p class="meta" style="border:1px solid #ccc;border-radius:4px;padding:8px 12px;background:#fffbe6">
    ⚠️ 当サイトは有志による非公式サイトです。防衛省・自衛隊および各地方協力本部とは直接関係ありません。<br />
    参加・申込・中止・変更などの最新情報は、必ず各地方協力本部の公式ページでご確認ください。
  </p>

${sections}

  <section style="margin-top:3em">
    <h2>種目から自衛隊イベントを探す</h2>
    <p class="meta">体験搭乗・艦艇公開・一般公開・記念行事・説明会など、種目ごとに全国横断で探せます。</p>
    <p>${CATEGORY_TOPICS.map(t => `<a href="/topics/${t.slug}.html">${esc(t.cat)}</a>`).join('　／　')}</p>
  </section>

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
  const prefJsonLd = jsonLdSafe(schemas);

  const officeCount = (officesByPref[prefKey] || []).length;
  const officeNote = officeCount > 0 ? `県内の募集案内所・地域事務所 ${officeCount} か所の連絡先も掲載。` : '';
  const countNote = hasEvents
    ? `説明会・体験イベント・駐屯地一般公開・記念行事など ${events.length} 件を掲載。${officeNote}`
    : `説明会・体験イベント・駐屯地一般公開・記念行事などの情報を掲載。${officeNote}`;

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
  <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />
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
    .natidx .idx { margin: 0.2em 0; }
    .natidx .idx h3 { font-size: 0.95em; margin: 0.8em 0 0.2em; }
    .natidx .idx p { font-size: 0.9em; line-height: 1.9; margin: 0; }
  </style>
</head>
<body>
  <nav><a href="/events.html">← 全国の自衛隊イベント一覧</a>　／　<a href="/guide.html">参加ガイド</a>　／　<a href="/">アプリ版（PWA）</a></nav>
  <h1>${esc(prefLabel)}の自衛隊イベント情報（${esc(prefLabel)}地方協力本部）</h1>
${prefEvergreen(prefLabel)}
  <h2>${esc(prefLabel)}の開催予定・最新イベント</h2>
${eventBlock}
${officeSection(prefKey, prefLabel)}
  ${regionNav(prefKey)}
  <section class="natidx" style="margin-top:2.5em">
    <h2>全国の自衛隊地本イベント（都道府県別）</h2>
    <p class="meta">他の地域の地方協力本部が公開する説明会・駐屯地／基地の一般公開・記念行事・体験イベントもご覧いただけます。</p>
${nationalIndex()}
  </section>
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

// ── カテゴリ横断ページ topics/<slug>.html を生成 ────────────────────
// 「体験搭乗 いつ」「艦艇公開 予定」等の“種目”クエリ向けエバーグリーンLP。
// 全国のイベントをカテゴリ横断で集約し、都道府県別ページ（縦）に対する
// 横断（横）の導線を作る（フィードバック§2-2-6 / §1-2）。URLは常設で安定させる。
const TOPICS_DIR = join(__dirname, '../public/topics');
mkdirSync(TOPICS_DIR, { recursive: true });

// カテゴリ間の相互リンク（内部リンク網でクロール性を高める）
function topicNav(currentSlug) {
  const links = CATEGORY_TOPICS
    .filter(t => t.slug !== currentSlug)
    .map(t => `<a href="/topics/${t.slug}.html">${esc(t.cat)}</a>`)
    .join('　／　');
  return `<nav class="topics-nav">種目から探す：${links}</nav>`;
}

const topicValidFiles = new Set(CATEGORY_TOPICS.map(t => `${t.slug}.html`));
for (const t of CATEGORY_TOPICS) {
  const evs = allEvents.filter(e => e.category === t.cat);
  // 都道府県別にまとめる（表示名の順序は allEvents=日付順を保つ）
  const grouped = {};
  for (const ev of evs) (grouped[ev.prefLabel] ||= []).push(ev);
  const sectionsHtml = Object.entries(grouped).map(([label, list]) => {
    const prefKey = list[0]?.prefKey ?? '';
    const prefLink = prefKey ? ` <a href="/events/${prefKey}.html">（${esc(label)}のみ）</a>` : '';
    return `  <section>
    <h2>${esc(label)}（${list.length}件）${prefLink}</h2>
    <ul>
      ${renderRows(list)}
    </ul>
  </section>`;
  }).join('\n\n');

  const schemas = [
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: '自衛隊地本イベント', item: `${SITE_URL}/events.html` },
      { '@type': 'ListItem', position: 2, name: t.h1, item: `${SITE_URL}/topics/${t.slug}.html` },
    ] },
    ...evs.map(ev => toEventSchema(ev, ev.prefLabel)),
  ];
  const topicJsonLd = jsonLdSafe(schemas);
  const desc = `全国の自衛隊「${t.cat}」イベントを横断でまとめた非公式ページ。${t.lead.slice(0, 60)}（${esc(updatedAt)}更新・${evs.length}件）`;

  const body = evs.length > 0
    ? sectionsHtml
    : `  <p class="meta">現在、公開中の「${esc(t.cat)}」イベントはありません。時期により開催状況が変わるため、都道府県別ページやアプリ版で最新情報をご確認ください。</p>`;

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(t.h1)}【全国・非公式まとめ】</title>
  <meta name="description" content="${esc(desc)}" />
  <meta name="keywords" content="${esc(t.kw)}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${SITE_URL}/topics/${t.slug}.html" />
  <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />
  <meta property="og:title" content="${esc(t.h1)}【非公式まとめ】" />
  <meta property="og:description" content="${esc(t.lead.slice(0, 100))}" />
  <meta property="og:url" content="${SITE_URL}/topics/${t.slug}.html" />
  <meta property="og:type" content="website" />
  <meta property="og:image" content="${SITE_URL}/icons/icon-512.png" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${esc(t.h1)}" />
  <meta name="twitter:description" content="${esc(t.lead.slice(0, 100))}" />
  <meta name="twitter:image" content="${SITE_URL}/icons/icon-512.png" />
  <script type="application/ld+json">
${topicJsonLd}
  </script>
  <style>
    body { font-family: sans-serif; max-width: 900px; margin: 0 auto; padding: 16px; line-height: 1.7; }
    h1 { font-size: 1.4em; }
    h2 { font-size: 1.1em; margin-top: 2em; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
    nav { margin-bottom: 1.2em; font-size: 0.9em; }
    .topics-nav { margin: 1.4em 0; font-size: 0.88em; color: #444; }
    ul { padding-left: 1.2em; }
    li { margin: 6px 0; font-size: 0.95em; }
    time { color: #555; }
    .meta { color: #666; font-size: 0.85em; }
    a { color: #0b2545; }
  </style>
</head>
<body>
  <nav><a href="/events.html">← 全国の自衛隊イベント一覧</a>　／　<a href="/">アプリ版（PWA）</a></nav>
  <h1>${esc(t.h1)}</h1>
  <p>${esc(t.lead)}全国の自衛隊地方協力本部が公開する情報を横断で自動集約しています（現在 ${evs.length} 件・${esc(updatedAt)} 更新）。</p>
  <p class="meta" style="border:1px solid #ccc;border-radius:4px;padding:8px 12px;background:#fffbe6">
    当サイトは有志による非公式サイトです。防衛省・自衛隊および各地方協力本部とは直接関係ありません。
    参加・申込・中止・変更などの最新情報は、必ず各地方協力本部の公式ページでご確認ください。
  </p>

${body}

  ${topicNav(t.slug)}

  <section style="margin-top:2.5em">
    <h2>地域から探す</h2>
    <p class="meta">お住まいの都道府県のイベントはこちらから。</p>
${nationalIndex()}
  </section>

  <footer>
    <p class="meta" style="margin-top:3em">
      本ページは自衛隊地方協力本部の公式サイトから取得した情報を自動集約したものです。最新・正確な情報は各地本公式サイトでご確認ください。
    </p>
  </footer>
</body>
</html>
`;
  writeFileSync(join(TOPICS_DIR, `${t.slug}.html`), minifyHtml(html), 'utf8');
  console.log(`[generate-events-html] topics/${t.slug}.html を生成（${evs.length} 件）`);
}
// 孤立トピックの掃除
for (const f of readdirSync(TOPICS_DIR)) {
  if (f.endsWith('.html') && !topicValidFiles.has(f)) {
    unlinkSync(join(TOPICS_DIR, f));
    console.log(`[generate-events-html] 孤立ファイル削除: topics/${f}`);
  }
}

// ── 参加ガイド guide.html を生成（長尾の情報収集クエリ向けエバーグリーン） ──
// 「自衛隊 説明会 流れ / 持ち物 / 服装 / 申込 / 体験搭乗 申し込み / 一般公開 楽しみ方 / 年齢」等。
// FAQ は可視本文と FAQPage 構造化データを同一データから生成し本文一致を担保する（2026年要件）。
const GUIDE_FAQ = [
  { q: '自衛隊の地本イベントにはどんな種類がありますか？',
    a: '主に、入隊・採用を検討する方向けの「自衛隊説明会・採用イベント」、どなたでも参加できる「駐屯地・基地の一般公開」「記念行事」、艦艇を見学できる「艦艇公開・体験航海」、ヘリや輸送機の「体験搭乗」、音楽隊の「演奏会」、地域のお祭りへの参加などがあります。本サイトでは都道府県別にこれらを自動集約して掲載しています。' },
  { q: '自衛隊の説明会に参加するには申し込みが必要ですか？',
    a: '説明会・個別相談会・体験イベントは、事前予約・事前申込が必要なことが多いです。一方で駐屯地／基地の一般公開や記念行事は申込不要で参加できる場合が一般的です。申込方法・締切・定員は各イベントの公式ページで必ずご確認ください。本サイトの各イベントには「要予約／予約不要」などの目安を表示しています。' },
  { q: '説明会の持ち物・服装は？',
    a: '一般的な説明会では特別な持ち物は不要ですが、筆記用具とメモ、配布資料を入れる袋があると便利です。本人確認書類の提示を求められる場合があります。服装は私服で問題ありませんが、清潔感のある服装が無難です。屋外の一般公開・体験イベントは歩きやすい靴と、季節に応じた防寒・暑さ・雨対策をおすすめします。' },
  { q: '自衛官の採用区分と年齢の目安を教えてください。',
    a: '代表的な区分として、自衛官候補生（18歳以上33歳未満が目安）、一般曹候補生、高等工科学校生徒（15歳以上17歳未満の男子・中卒〜高卒見込み）、防衛大学校・防衛医科大学校などがあります。年齢・学歴の要件は年度や区分で異なるため、必ず最新の募集要項を地方協力本部の公式サイトでご確認ください。' },
  { q: '駐屯地・基地の一般公開は何を楽しめますか？',
    a: '装備品・車両・航空機の展示、訓練展示や音楽演奏、戦車・ヘリの地上展示、子ども向け体験コーナー、売店・キッチンカーなどが一般的です。記念行事では観閲式や式典が行われることもあります。当日は混雑・駐車場・手荷物検査などの案内に従ってください。最新の開催可否・内容は公式情報をご確認ください。' },
  { q: '体験搭乗・体験航海はどう申し込みますか？',
    a: '体験搭乗（ヘリ・輸送機など）や体験航海（艦艇）は、人気が高く事前申込・抽選となることが多いです。募集は地方協力本部や駐屯地・基地の公式サイト、募集案内所で告知されます。本サイトでも体験系イベントを「体験」カテゴリで掲載しているので、気になる地域のページを確認し、公式の募集要項に沿ってお申し込みください。' },
  { q: 'イベント情報はどのくらいの頻度で更新されますか？',
    a: '本サイトは全国の地方協力本部・募集案内所の公式サイトを1日3回自動巡回し、最新のイベント情報を都道府県別に更新しています。ただし公式の中止・変更・延期が即時に反映されない場合があります。参加前には必ず各イベントの公式ページで最新情報をご確認ください。' },
];

const guideJsonLd = jsonLdSafe([
  { '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: GUIDE_FAQ.map(f => ({ '@type': 'Question', name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
  { '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '自衛隊地本イベント情報', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: '自衛隊イベント参加ガイド', item: `${SITE_URL}/guide.html` },
    ] },
]);

const guideHtml = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>自衛隊イベント参加ガイド | 説明会の流れ・持ち物・申込・体験搭乗の探し方【非公式】</title>
  <meta name="description" content="自衛隊の説明会・一般公開・体験搭乗・記念行事に参加する前に知っておきたいこと。申込の要否、持ち物・服装、自衛官の採用区分と年齢の目安、体験搭乗の探し方などを非公式にまとめた参加ガイドです。" />
  <meta name="keywords" content="自衛隊 説明会 流れ,自衛隊 説明会 持ち物,自衛隊 説明会 服装,自衛隊 体験搭乗 申し込み,駐屯地 一般公開 楽しみ方,自衛官候補生 年齢,自衛隊 イベント 申込,地方協力本部" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${SITE_URL}/guide.html" />
  <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />
  <meta property="og:title" content="自衛隊イベント参加ガイド【非公式】" />
  <meta property="og:description" content="説明会の流れ・持ち物・申込の要否、体験搭乗の探し方、採用区分と年齢の目安をまとめた参加ガイド。" />
  <meta property="og:url" content="${SITE_URL}/guide.html" />
  <meta property="og:type" content="article" />
  <meta property="og:image" content="${SITE_URL}/icons/icon-512.png" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="自衛隊イベント参加ガイド【非公式】" />
  <meta name="twitter:description" content="説明会の流れ・持ち物・申込の要否、体験搭乗の探し方、採用区分と年齢の目安をまとめた参加ガイド。" />
  <meta name="twitter:image" content="${SITE_URL}/icons/icon-512.png" />
  <script type="application/ld+json">
${guideJsonLd}
  </script>
  <style>
    body { font-family: sans-serif; max-width: 900px; margin: 0 auto; padding: 16px; line-height: 1.8; }
    h1 { font-size: 1.4em; }
    h2 { font-size: 1.15em; margin-top: 2em; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
    h3 { font-size: 1.02em; margin: 1.4em 0 0.3em; }
    nav { margin-bottom: 1.5em; font-size: 0.9em; }
    .meta { color: #666; font-size: 0.85em; }
    a { color: #0b2545; }
  </style>
</head>
<body>
  <nav><a href="/events.html">← 全国の自衛隊イベント一覧</a>　／　<a href="/">アプリ版（PWA）</a></nav>
  <h1>自衛隊イベント参加ガイド｜説明会・一般公開・体験搭乗の歩き方</h1>
  <p>本ページは、自衛隊の地方協力本部（地本）が開催する各種イベントに、はじめて参加する方・入隊を検討している方向けに、よくある疑問を非公式にまとめたガイドです。
  全国の最新イベントは<a href="/events.html">都道府県別の一覧</a>からご確認いただけます。</p>
  <p class="meta">当サイトは有志による非公式サイトです。防衛省・自衛隊および各地方協力本部とは直接関係ありません。最新・正確な情報は各公式サイトでご確認ください。</p>

  ${GUIDE_FAQ.map(f => `<section>
    <h2>${esc(f.q)}</h2>
    <p>${esc(f.a)}</p>
  </section>`).join('\n  ')}

  <section style="margin-top:2.5em">
    <h2>地域から自衛隊イベントを探す</h2>
    <p class="meta">お住まいの都道府県の最新イベント（説明会・一般公開・記念行事・体験）はこちらから。</p>
${nationalIndex()}
  </section>

  <footer>
    <p class="meta" style="margin-top:3em">
      ⚠️ 当サイトは有志による非公式サイトです。参加・申込・中止・変更などの最新情報は、必ず各地方協力本部の公式サイトでご確認ください。
      公式情報は <a href="https://www.mod.go.jp/" rel="nofollow noopener" target="_blank">防衛省・自衛隊 公式サイト</a> をご覧ください。
    </p>
  </footer>
</body>
</html>
`;
writeFileSync(join(__dirname, '../public/guide.html'), minifyHtml(guideHtml), 'utf8');
console.log('[generate-events-html] guide.html を生成');

// ── sitemap.xml を更新 ──────────────────────────────────────────
// 全都道府県ページを掲載。非ページの events.json は含めない（インデックス未登録の原因）。
// イベントの有無で priority / changefreq を出し分け、クロール資源を有効ページへ誘導する
// （0件県は事務所一覧が主コンテンツ＝更新頻度が低いので monthly / 低priority）。

const prefUrls = Object.keys(PREF_LABELS).map(k => {
  const has = (byPrefKey[k] ?? []).length > 0;
  return `  <url>
    <loc>${SITE_URL}/events/${k}.html</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${has ? 'daily' : 'monthly'}</changefreq>
    <priority>${has ? '0.8' : '0.4'}</priority>
  </url>`;
}).join('\n');

// カテゴリ横断ページ（種目LP）をサイトマップに追加
const topicUrls = CATEGORY_TOPICS.map(t => {
  const has = allEvents.some(e => e.category === t.cat);
  return `  <url>
    <loc>${SITE_URL}/topics/${t.slug}.html</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${has ? 'weekly' : 'monthly'}</changefreq>
    <priority>${has ? '0.7' : '0.4'}</priority>
  </url>`;
}).join('\n');

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
  <url>
    <loc>${SITE_URL}/guide.html</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
${topicUrls}
${prefUrls}
</urlset>
`;

const sitemapPath = join(__dirname, '../public/sitemap.xml');
writeFileSync(sitemapPath, sitemap, 'utf8');
console.log(`[generate-events-html] sitemap.xml を更新（${Object.keys(PREF_LABELS).length + 3} URL）`);
