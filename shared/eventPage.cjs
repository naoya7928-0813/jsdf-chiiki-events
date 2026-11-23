'use strict';
/**
 * イベント個別ページ（/event/<id>）と Event 構造化データの唯一の出どころ（2026-11-23 導入）。
 *
 * 使う側:
 *   - middleware.js（Edge）… /event/<id> の HTML に title・説明・canonical・robots・JSON-LD・本文を差し込む
 *   - scripts/generate-events-html.mjs … 一覧ページからの内部リンク・sitemap の URL と lastmod
 *
 * 決めごと（推測で埋めない）:
 *   - 料金は「無料」と資料に書かれているときだけ price 0 を出す。分からなければ offers 自体を出さない
 *   - 受付状況（availability）・受付開始日（validFrom）は資料から分からないので出さない
 *   - 主催者（organizer）・出演者（performer）は分からないので出さない。地本は「掲載元」として本文に書く
 *   - 会場名が無い／掲載元の案内所名で埋めただけ／都道府県が決められないイベントは Event を出さない
 *   - 画像は出さない（チラシは権利を確認できないため。shared/eventImages.cjs の方針と同じ）
 *   - Event は個別ページにだけ置く（一覧ページには置かない。Google の「1イベント1ページ」の考え方）
 *
 * Edge でも動くよう Node 専用 API（fs・crypto 等）は使わない。
 */

const { isEligibleForStructuredEvent, isPlaceholderPlace } = require('./titleQuality.cjs');

/** 地本キー → 表示名（middleware・静的ページ生成で共有） */
const PREF_LABELS = Object.freeze({
  sapporo: '札幌', asahikawa: '旭川', obihiro: '帯広', hakodate: '函館',
  aomori: '青森', iwate: '岩手', miyagi: '宮城', akita: '秋田', yamagata: '山形', fukushima: '福島',
  ibaraki: '茨城', tochigi: '栃木', gunma: '群馬', saitama: '埼玉', chiba: '千葉', tokyo: '東京', kanagawa: '神奈川',
  niigata: '新潟', toyama: '富山', ishikawa: '石川', fukui: '福井', yamanashi: '山梨', nagano: '長野',
  gifu: '岐阜', shizuoka: '静岡', aichi: '愛知',
  mie: '三重', shiga: '滋賀', kyoto: '京都', osaka: '大阪', hyogo: '兵庫', nara: '奈良', wakayama: '和歌山',
  tottori: '鳥取', shimane: '島根', okayama: '岡山', hiroshima: '広島', yamaguchi: '山口',
  tokushima: '徳島', kagawa: '香川', ehime: '愛媛', kochi: '高知',
  fukuoka: '福岡', saga: '佐賀', nagasaki: '長崎', kumamoto: '熊本', oita: '大分', miyazaki: '宮崎', kagoshima: '鹿児島', okinawa: '沖縄',
});

const HOKKAIDO_KEYS = new Set(['sapporo', 'asahikawa', 'obihiro', 'hakodate']);

/** 地本キー → 都道府県の正式名（札幌・旭川・帯広・函館は北海道） */
function prefectureName(prefKey) {
  if (HOKKAIDO_KEYS.has(prefKey)) return '北海道';
  const label = PREF_LABELS[prefKey];
  if (!label) return '';
  if (label === '東京') return '東京都';
  if (label === '京都' || label === '大阪') return `${label}府`;
  return `${label}県`;
}

const PREFECTURE_RE = /^(北海道|東京都|京都府|大阪府|[^\s都道府県]{2,3}県)/;

const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const dayOf = (s) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '');

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** <script type="application/ld+json"> 用。"<" を逃がして </script> による破壊を防ぐ */
function jsonLdSafe(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

const isHttpUrl = (u) => typeof u === 'string' && /^https?:\/\/[^\s<>"]+$/.test(u);

/** 一覧側の重複回避接尾辞（~2 等）を外した基底ID */
function baseEventId(id) {
  return String(id || '').replace(/~\d+$/, '');
}

/** events.json（地本キー → 配列）から ID でイベントを探す。{ ev, prefKey } か null */
function findEvent(data, id) {
  if (!data || typeof data !== 'object') return null;
  const base = baseEventId(id);
  if (!base) return null;
  for (const [k, arr] of Object.entries(data)) {
    if (!Array.isArray(arr)) continue;
    const ev = arr.find(e => e && e.id === base);
    if (ev) return { ev, prefKey: k };
  }
  return null;
}

/**
 * 今週末（直近の土曜・日曜）の範囲 { sat, sun }。日曜日は当日だけ（過ぎた土曜には戻さない）。
 * 画面の「今週末」絞り込み（FilterBar）と静的ページ（topics/weekend.html）で共有する。
 */
function weekendRange(today) {
  const addDays = (s, n) => {
    const d = new Date(`${s}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  if (dow === 0) return { sat: today, sun: today };
  const toSat = 6 - dow;
  return { sat: addDays(today, toSat), sun: addDays(today, toSat + 1) };
}

/** 今週末に開催がかかるか（終了前のものだけ） */
function isWeekendEvent(ev, today) {
  if (!ev || !isDate(ev.date)) return false;
  const { sat, sun } = weekendRange(today);
  const end = (isDate(ev.endDate) && ev.endDate >= ev.date) ? ev.endDate : ev.date;
  return ev.date <= sun && end >= sat && end >= today;
}

/**
 * 公開データ（events.json）に、運営の手動イベントと上書き修正（/api/manual-events の { events, overrides }）を合流させる。
 * アプリ（src/hooks/useEvents.js）と個別ページ（middleware.js）で同じ結果にするための唯一の実装。
 *   - 手動イベントは地本ごとの配列の末尾に足す
 *   - 上書き修正（日時・会場の修正、中止・延期など）はイベントID一致で上から重ねる
 * 元の data は変更しない。manual が無い・形が違うときは data をそのまま返す。
 */
function mergePublished(data, manual) {
  const merged = { ...(data || {}) };
  const events = Array.isArray(manual && manual.events) ? manual.events : [];
  const overrides = (manual && manual.overrides && typeof manual.overrides === 'object') ? manual.overrides : {};
  for (const ev of events) {
    const k = ev && ev.pref;
    if (!k) continue;
    merged[k] = Array.isArray(merged[k]) ? [...merged[k], ev] : [ev];
  }
  if (Object.keys(overrides).length > 0) {
    for (const k of Object.keys(merged)) {
      if (!Array.isArray(merged[k])) continue;
      merged[k] = merged[k].map(ev => ((ev && overrides[ev.id]) ? { ...ev, ...overrides[ev.id] } : ev));
    }
  }
  return merged;
}

/** 手動入力イベント（Redis にあり events.json には無い）の ID か */
function isManualEventId(id) {
  return /^manual-/.test(String(id || ''));
}

/** 終了済みか（endDate||date が今日より前） */
function isEnded(ev, today) {
  const end = (isDate(ev?.endDate) && ev.endDate >= ev.date) ? ev.endDate : ev?.date;
  return !!(isDate(end) && today && end < today);
}

/** `time`（"09:00～14:30"）を開始・終了へ。両方そろい、終了が開始より後のときだけ返す */
function parseTimeRange(time) {
  const m = String(time ?? '').trim()
    .match(/^(\d{1,2}):(\d{2})\s*[～~〜\-–—]\s*(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const [sh, sm, eh, em] = [m[1], m[2], m[3], m[4]].map(Number);
  if (sh > 23 || eh > 23 || sm > 59 || em > 59) return null;
  if (eh * 60 + em <= sh * 60 + sm) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return { start: `${pad(sh)}:${pad(sm)}`, end: `${pad(eh)}:${pad(em)}` };
}

/**
 * 参加・入場が無料だと資料に書かれているか。
 * 「無料送迎バス」「無料駐車場」のような料金以外の「無料」は拾わない。
 */
const FREE_RE = /(入場|参加|観覧|見学|受講|乗艦|体験)(料|費)?(は)?(無料|0円|０円)|無料(公開|招待|開放)|(参加|入場)費?無料/;
function isConfirmedFree(ev) {
  if (!ev) return false;
  if (ev.tag === '入場無料') return true;
  if (Array.isArray(ev.tags) && ev.tags.includes('入場無料')) return true;
  return FREE_RE.test(`${ev.title || ''} ${ev.notes || ''}`);
}

const PREF_NAME_IN_TEXT_RE = /(北海道|青森|岩手|宮城|秋田|山形|福島|茨城|栃木|群馬|埼玉|千葉|東京|神奈川|新潟|富山|石川|福井|山梨|長野|岐阜|静岡|愛知|三重|滋賀|京都|大阪|兵庫|奈良|和歌山|鳥取|島根|岡山|広島|山口|徳島|香川|愛媛|高知|福岡|佐賀|長崎|熊本|大分|宮崎|鹿児島|沖縄)(都|道|府|県)/;

/**
 * 会場名が既知の駐屯地・基地（src/data/jsdfFacilities.js）に当たれば、その施設 { region, locality }。
 * 「陸上自衛隊 三沢基地」→「三沢基地」のように種別を外した名前で、長い名前から照合する
 * （「北宇都宮駐屯地」を「宇都宮駐屯地」と取り違えない）。
 */
function facilityRegion(place, facilities) {
  if (!place || !Array.isArray(facilities) || !facilities.length) return null;
  const list = facilities
    .map(f => ({ core: String(f.name || '').replace(/^(陸上|海上|航空)自衛隊\s*/, '').trim(), address: String(f.address || '') }))
    .filter(f => f.core.length >= 3)
    .sort((a, b) => b.core.length - a.core.length);
  const hit = list.find(f => String(place).includes(f.core));
  if (!hit) return null;
  const m = hit.address.match(PREFECTURE_RE);
  if (!m) return null;
  return { region: m[1], locality: hit.address.slice(m[1].length).match(/^[^市区町村郡]*[市区町村郡]/)?.[0] || '' };
}

/**
 * 会場の住所（PostalAddress）。都道府県が決められなければ null。
 *   1. 住所欄が都道府県名で始まる → そのまま
 *   2. 会場名が既知の駐屯地・基地 → その施設の都道府県・市区町村
 *   3. 座標の検索結果（accuracy が住所・手動・会場名・市区町村）のラベルが都道府県名で始まる → 都道府県
 *      ただし会場名・市区町村レベルの検索は「地本の都道府県名を前置して」引いているため、
 *      会場名に別の都道府県名が書かれているときは使わない（函館地本「…青森県の三沢基地」→北海道 の誤り）
 *   ※ 地本の担当県で埋めない（東京地本のイベントが埼玉の駐屯地で開かれることがある）
 */
function eventAddress(ev, { facilities } = {}) {
  const addr = String(ev?.address || '').trim();
  const m = addr.match(PREFECTURE_RE);
  if (m) {
    return { '@type': 'PostalAddress', addressCountry: 'JP', addressRegion: m[1], streetAddress: addr };
  }
  const fac = facilityRegion(ev?.place, facilities);
  if (fac) {
    const out = { '@type': 'PostalAddress', addressCountry: 'JP', addressRegion: fac.region };
    if (fac.locality) out.addressLocality = fac.locality;
    if (addr) out.streetAddress = addr;
    return out;
  }
  const wl = ev?.weatherLocation;
  const biased = wl && (wl.accuracy === 'venue' || wl.accuracy === 'municipality');
  const otherPref = String(ev?.place || '').match(PREF_NAME_IN_TEXT_RE);
  if (wl && ['address', 'venue', 'municipality', 'manual'].includes(wl.accuracy)
      && !(biased && (otherPref || /^県の|[^都道府]県の/.test(String(ev?.place || ''))))) {
    const label = String(wl.label || '').trim();
    const lm = label.match(PREFECTURE_RE);
    if (lm) {
      const out = { '@type': 'PostalAddress', addressCountry: 'JP', addressRegion: lm[1] };
      const locality = label.slice(lm[1].length).trim();
      // 市区町村まで確かなのは住所・手動入力から求めた座標だけ
      if (locality && (wl.accuracy === 'address' || wl.accuracy === 'manual' || wl.accuracy === 'municipality')) {
        out.addressLocality = locality;
      }
      if (addr) out.streetAddress = addr;
      return out;
    }
  }
  return null;
}

/** 開催地の都道府県（分からなければ ''）。本文表示・検索用 */
function venuePrefecture(ev, opts) {
  return eventAddress(ev, opts)?.addressRegion || '';
}

/**
 * 公式URLのファイル名に入っている日付（「…20260216.pdf」）より、開催日が9か月以上あと。
 * 掲載日より大幅にあとの開催日は、過年度の資料・日付の誤読であることが多い
 * （2026-11 函館: 2026-02-16 の資料が 2027-02-08 の予定として出ていた）。検索対象・構造化データから外す。
 */
function hasDateStampConflict(ev) {
  let url = String(ev?.url || '');
  try { url = decodeURIComponent(url); } catch { /* そのまま */ }
  const file = url.split(/[?#]/)[0].split('/').pop() || '';
  const m = file.match(/(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])/);
  if (!m || !isDate(ev?.date)) return false;
  const stamp = Date.parse(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  const date = Date.parse(`${ev.date}T00:00:00Z`);
  return Number.isFinite(stamp) && (date - stamp) / 86400000 > 270;
}

/**
 * Event 構造化データを出してよいか（個別ページ用・公開より厳しい）。
 * 品質（titleQuality）＋会場名が実在＋都道府県が決まる＋終了していない＋公式URLがある。
 */
function isEventSchemaEligible(ev, today, opts) {
  if (!isEventIndexable(ev, today)) return false;
  if (isPlaceholderPlace(ev)) return false;
  if (!eventAddress(ev, opts)) return false;
  if (!isHttpUrl(ev.url)) return false;
  return true;
}

/**
 * 個別ページを検索結果に出すか（robots index）。
 * 構造化データほど厳しくはしないが、中身が確かめられないもの（公式URLなし）・終了済み・不正タイトルは出さない。
 */
function isEventIndexable(ev, today) {
  if (!ev || !isDate(ev.date)) return false;
  if (!isEligibleForStructuredEvent(ev, today)) return false;
  if (ev.status === 'draft') return false;
  if (isEnded(ev, today)) return false;
  if (!isHttpUrl(ev.url)) return false;
  if (hasDateStampConflict(ev)) return false;
  return true;
}

/** 個別ページの URL（パス） */
function eventPath(ev) {
  return `/event/${encodeURIComponent(baseEventId(ev?.id))}`;
}

/** Schema.org Event（出せないときは null） */
function buildEventSchema(ev, { siteUrl, today, prefKey, facilities } = {}) {
  if (!isEventSchemaEligible(ev, today, { facilities })) return null;
  const pageUrl = `${siteUrl}${eventPath(ev)}`;
  const obj = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: ev.title,
    eventStatus: ev.status === 'cancelled' ? 'https://schema.org/EventCancelled'
      : ev.status === 'postponed' ? 'https://schema.org/EventPostponed'
      : 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    url: pageUrl,
    location: { '@type': 'Place', name: ev.place, address: eventAddress(ev, { facilities }) },
  };
  const endDay = (isDate(ev.endDate) && ev.endDate >= ev.date) ? ev.endDate : ev.date;
  const range = parseTimeRange(ev.time);
  if (range) {
    obj.startDate = `${ev.date}T${range.start}:00+09:00`;
    obj.endDate = `${endDay}T${range.end}:00+09:00`;
  } else {
    obj.startDate = ev.date;
    obj.endDate = endDay;
  }
  // 料金は「無料」と確認できたときだけ。分からなければ offers を出さない
  if (isConfirmedFree(ev)) {
    obj.isAccessibleForFree = true;
    obj.offers = { '@type': 'Offer', price: '0', priceCurrency: 'JPY', url: ev.url };
  }
  const desc = eventDescription(ev, { prefKey });
  if (desc) obj.description = desc;
  // 公式の掲載ページ（一次情報）
  obj.sameAs = ev.url;
  return obj;
}

/** パンくず（トップ → 都道府県ページ → イベント） */
function buildBreadcrumb(ev, { siteUrl, prefKey }) {
  const label = PREF_LABELS[prefKey] || prefKey;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '自衛隊地本イベント一覧', item: `${siteUrl}/events.html` },
      { '@type': 'ListItem', position: 2, name: `${label}の自衛隊イベント`, item: `${siteUrl}/events/${prefKey}.html` },
      { '@type': 'ListItem', position: 3, name: ev.title, item: `${siteUrl}${eventPath(ev)}` },
    ],
  };
}

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
function jaDate(s) {
  if (!isDate(s)) return '';
  const d = new Date(`${s}T00:00:00Z`);
  return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日（${WEEK[d.getUTCDay()]}）`;
}
function shortDate(s) {
  if (!isDate(s)) return '';
  return `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}`;
}
function dateLabel(ev) {
  const a = jaDate(ev.date);
  if (isDate(ev.endDate) && ev.endDate > ev.date) return `${a}〜${jaDate(ev.endDate)}`;
  return a;
}

const STATUS_LABEL = { cancelled: '中止', postponed: '延期', closed: '受付終了' };
function statusLabel(ev, today) {
  if (STATUS_LABEL[ev.status]) return STATUS_LABEL[ev.status];
  if (isEnded(ev, today)) return '終了';
  return '開催予定';
}

/** 説明文（meta description・構造化データ）。資料にある値だけを並べる */
function eventDescription(ev, { prefKey, updatedAt } = {}) {
  const label = PREF_LABELS[prefKey] || '';
  const parts = [];
  const dl = dateLabel(ev);
  if (dl) parts.push(`${dl}${ev.time ? ` ${ev.time}` : ''}開催`);
  if (ev.place && !isPlaceholderPlace(ev)) parts.push(`会場：${ev.place}`);
  if (ev.category) parts.push(ev.category);
  if (ev.deadline) parts.push(`申込締切 ${ev.deadline}`);
  if (ev.ageRequirement) parts.push(`対象 ${ev.ageRequirement}`);
  let s = parts.join('。');
  if (label) s += `。${label}地方協力本部の公開情報をもとに掲載${updatedAt ? `（${updatedAt}確認）` : ''}`;
  s += '。参加前に公式ページで最新情報をご確認ください。';
  return s.length > 160 ? `${s.slice(0, 159)}…` : s;
}

/** <title> */
function eventTitleTag(ev, prefKey) {
  const label = PREF_LABELS[prefKey] || '';
  const when = shortDate(ev.date);
  return `${ev.title}${when ? `（${when}）` : ''}｜${label}の自衛隊イベント【非公式】`;
}

/** 関連イベント（同じ地本 → 同じ種目の順。終了済み・自分自身は除く） */
function relatedEvents(data, ev, prefKey, today, limit = 6) {
  const out = [];
  const seen = new Set([ev.id]);
  const all = [];
  for (const [k, arr] of Object.entries(data || {})) {
    if (!Array.isArray(arr)) continue;
    for (const e of arr) if (e && e.id && isDate(e.date)) all.push({ e, k });
  }
  all.sort((a, b) => a.e.date.localeCompare(b.e.date));
  const ok = ({ e }) => !seen.has(e.id) && !isEnded(e, today) && isEligibleForStructuredEvent(e, today);
  for (const x of all) {
    if (out.length >= limit) break;
    if (x.k === prefKey && ok(x)) { out.push(x); seen.add(x.e.id); }
  }
  for (const x of all) {
    if (out.length >= limit) break;
    if (x.e.category && x.e.category === ev.category && ok(x)) { out.push(x); seen.add(x.e.id); }
  }
  return out;
}

/** Google マップの検索リンク（会場名・住所から。埋め込みはしない） */
function mapsUrl(ev) {
  const q = [ev.address, !isPlaceholderPlace(ev) ? ev.place : ''].filter(Boolean)[0];
  if (!q) return '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/**
 * 本文（JS なしでも読める記事）。SPA が描画されると App.jsx が取り除く（同じ情報を SPA が表示する）。
 */
function renderEventArticle(ev, { prefKey, today, updatedAt, related = [], officialHqUrl = '', facilities } = {}) {
  const label = PREF_LABELS[prefKey] || prefKey;
  const st = statusLabel(ev, today);
  const rows = [];
  const row = (k, v) => { if (v) rows.push(`<tr><th>${esc(k)}</th><td>${v}</td></tr>`); };
  row('開催状況', esc(st));
  row('開催日', esc(dateLabel(ev)));
  row('時間', esc(ev.time));
  row('会場', isPlaceholderPlace(ev) ? '' : esc(ev.place));
  row('住所', esc(ev.address));
  const vp = venuePrefecture(ev, { facilities });
  if (vp) row('開催地', esc(vp));
  row('種目', esc(ev.category));
  row('申込', esc(ev.tag));
  row('申込締切', esc(ev.deadline));
  row('対象', esc(ev.ageRequirement));
  row('備考', esc(ev.notes));
  row('掲載元', `${esc(label)}地方協力本部（主催者は公式ページでご確認ください）`);
  const official = isHttpUrl(ev.url) ? ev.url : (isHttpUrl(officialHqUrl) ? officialHqUrl : '');
  if (official) {
    row('公式情報', `<a href="${esc(official)}" rel="noopener noreferrer" target="_blank">${isHttpUrl(ev.url) ? '公式の掲載ページ' : `${esc(label)}地方協力本部の公式サイト`}</a>`);
  }
  if (updatedAt) row('最終確認', `${esc(updatedAt)}（当サイトが公式サイトを確認した日時）`);
  const map = mapsUrl(ev);
  if (map) row('アクセス', `<a href="${esc(map)}" rel="noopener noreferrer" target="_blank">Google マップで場所を確認</a>`);

  const rel = related.length
    ? `<h2>関連する自衛隊イベント</h2><ul>${related.map(({ e, k }) =>
      `<li><a href="${esc(eventPath(e))}">${esc(e.title)}</a>（${esc(shortDate(e.date))}・${esc(PREF_LABELS[k] || k)}）</li>`).join('')}</ul>`
    : '';

  return `<main id="ssr-event" aria-label="イベント詳細">`
    + `<nav class="ssr-bc"><a href="/">トップ</a> › <a href="/events/${esc(prefKey)}.html">${esc(label)}の自衛隊イベント</a></nav>`
    + `<h1>${esc(ev.title)}</h1>`
    + `<table>${rows.join('')}</table>`
    + rel
    + `<p class="ssr-note">当サイトは有志による非公式サイトです。防衛省・自衛隊および各地方協力本部とは直接関係ありません。参加・申込・中止・変更などの最新情報は、必ず公式ページでご確認ください。</p>`
    + `<p><a href="/events/${esc(prefKey)}.html">${esc(label)}の自衛隊イベント一覧</a>　／　<a href="/events.html">全国の自衛隊イベント一覧</a></p>`
    + `</main>`;
}

/** 本文の見た目（JS 実行前のテーマに合わせる。--boot-bg は shared/bootTheme.cjs が決める） */
const ARTICLE_STYLE = '<style id="ssr-event-style">'
  + '#ssr-event{position:fixed;inset:0;overflow:auto;z-index:1;background:var(--boot-bg,#f5f6f8);color:#1b2333;'
  + 'font-family:sans-serif;line-height:1.7;padding:16px;box-sizing:border-box}'
  + '#ssr-event h1{font-size:1.3em;margin:.4em 0 .6em}#ssr-event h2{font-size:1.05em;margin-top:1.6em}'
  + '#ssr-event table{border-collapse:collapse;width:100%;max-width:760px}'
  + '#ssr-event th{text-align:left;white-space:nowrap;padding:6px 10px 6px 0;vertical-align:top;font-weight:600}'
  + '#ssr-event td{padding:6px 0;word-break:break-word}#ssr-event a{color:#0b4f9c}'
  + '#ssr-event .ssr-note{font-size:.85em;opacity:.8}#ssr-event .ssr-bc{font-size:.85em}'
  + '@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) #ssr-event{color:#e6edf3}:root:not([data-theme="light"]) #ssr-event a{color:#7cb7ff}}'
  + ':root[data-theme="dark"] #ssr-event{color:#e6edf3}:root[data-theme="dark"] #ssr-event a{color:#7cb7ff}'
  + '</style>';

/**
 * 個別ページの差し込み内容をまとめて作る（middleware とテストが使う）。
 * 戻り値: { title, description, canonical, robots, jsonLd: [..], article, ogTitle, ogDescription }
 */
function buildEventPage(data, id, { siteUrl, today, hqUrlByPref = {}, facilities } = {}) {
  const hit = findEvent(data, id);
  if (!hit) return null;
  const { ev, prefKey } = hit;
  const updatedAt = typeof data.updatedAt === 'string' ? data.updatedAt : '';
  const canonical = `${siteUrl}${eventPath(ev)}`;
  const indexable = isEventIndexable(ev, today);
  const schema = buildEventSchema(ev, { siteUrl, today, prefKey, facilities });
  const jsonLd = [buildBreadcrumb(ev, { siteUrl, prefKey })];
  if (schema) jsonLd.unshift(schema);
  const related = relatedEvents(data, ev, prefKey, today);
  return {
    ev, prefKey,
    title: eventTitleTag(ev, prefKey),
    description: eventDescription(ev, { prefKey, updatedAt }),
    canonical,
    robots: indexable ? 'index, follow' : 'noindex, follow',
    indexable,
    hasEventSchema: !!schema,
    jsonLd,
    article: renderEventArticle(ev, { prefKey, today, updatedAt, related, officialHqUrl: hqUrlByPref[prefKey], facilities }),
  };
}

/**
 * index.html に個別ページの内容を差し込む。
 *   - <title>・meta description・robots を置き換え
 *   - <!--OG:START-->〜<!--OG:END--> を置き換え（OGP・canonical・Twitter）
 *   - JSON-LD と本文の見た目を </head> の前へ、本文を <div id="root"> の前へ
 * 目印が見つからなければ null（呼び出し側は素通しする＝ページを壊さない）。
 */
function injectEventPage(html, page, { ogBlock } = {}) {
  if (typeof html !== 'string' || !page) return null;
  const START = '<!--OG:START-->', END = '<!--OG:END-->';
  const s = html.indexOf(START), e = html.indexOf(END);
  if (s === -1 || e === -1 || e < s) return null;
  if (!/<title>[\s\S]*?<\/title>/.test(html) || !html.includes('<div id="root">') || !html.includes('</head>')) return null;
  let out = html.slice(0, s) + START + (ogBlock || '') + END + html.slice(e + END.length);
  out = out.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(page.title)}</title>`);
  out = out.replace(/<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${esc(page.description)}" />`);
  out = out.replace(/<meta name="robots" content="[^"]*"\s*\/?>/, `<meta name="robots" content="${esc(page.robots)}" />`);
  const ld = `<script type="application/ld+json">${jsonLdSafe(page.jsonLd)}</script>`;
  out = out.replace('</head>', `${ld}${ARTICLE_STYLE}</head>`);
  out = out.replace('<div id="root">', `${page.article}<div id="root">`);
  return out;
}

/** 存在しない／掲載終了の /event/<id> 用。robots を noindex にするだけ（本文は SPA の404画面） */
function injectNotFound(html) {
  if (typeof html !== 'string') return null;
  if (!/<meta name="robots" content="[^"]*"\s*\/?>/.test(html)) return null;
  return html.replace(/<meta name="robots" content="[^"]*"\s*\/?>/, '<meta name="robots" content="noindex, follow" />');
}

/**
 * sitemap の lastmod 用。イベントの中身が変わった目印（初回掲載・照合・開催状況の更新・変更登録）の最も新しい日。
 */
function eventLastmod(ev) {
  const days = [dayOf(ev?.firstSeen), dayOf(ev?.verifiedAt), dayOf(ev?.statusUpdatedAt)];
  if (Array.isArray(ev?.changes)) for (const c of ev.changes) days.push(dayOf(c?.at));
  return days.filter(Boolean).sort().pop() || '';
}

module.exports = {
  PREF_LABELS, prefectureName, weekendRange, isWeekendEvent, mergePublished, esc, jsonLdSafe, baseEventId, findEvent, isManualEventId,
  isEnded, parseTimeRange, isConfirmedFree, eventAddress, venuePrefecture, facilityRegion, hasDateStampConflict,
  isEventSchemaEligible, isEventIndexable, eventPath, buildEventSchema, buildBreadcrumb,
  eventDescription, eventTitleTag, relatedEvents, mapsUrl, renderEventArticle,
  buildEventPage, injectEventPage, injectNotFound, eventLastmod, statusLabel, ARTICLE_STYLE,
};
