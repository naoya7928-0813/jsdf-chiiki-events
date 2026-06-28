// イベントの住所・会場名 → 緯度経度（ジオコーディング）
//
// 方針:
// - 国土地理院（GSI）住所検索 API を使う（無料・APIキー不要・日本の住所/施設名に強い）。
//   返却座標は [経度, 緯度] の順なので注意。
// - 結果は scraper/geocode-cache.json にコミットして永続化し、同じ会場を毎回検索しない。
//   ヒットしなかったクエリは null をキャッシュ（負のキャッシュ）して再問い合わせを防ぐ。
//   ネットワークエラー時はキャッシュせず次回再試行する。
// - 取得精度（accuracy）は address > venue > municipality > prefecture の順に試し、
//   最初にヒットした段階を採用する。
//
// 出力（events.json の各イベントへ保存する weatherLocation）:
//   { latitude, longitude, label, accuracy }
//   accuracy: 'address' | 'venue' | 'municipality' | 'prefecture'（手動入力は 'manual'）
'use strict';

const fs = require('fs');
const path = require('path');

const CACHE_PATH = path.join(__dirname, '../geocode-cache.json');
const GSI_URL = 'https://msearch.gsi.go.jp/address-search/AddressSearch?q=';
// GSI へ連続アクセスする際の最小間隔（負荷をかけないよう礼儀的に空ける）
const POLITE_DELAY_MS = 150;

// pref キー → 都道府県名（prefecture フォールバック用）。
// 北海道の4方面隊キーは都道府県では曖昧なので主要市名で代用する。
const PREF_JP = {
  sapporo: '北海道札幌市', asahikawa: '北海道旭川市', obihiro: '北海道帯広市', hakodate: '北海道函館市',
  miyagi: '宮城県', aomori: '青森県', iwate: '岩手県', yamagata: '山形県', fukushima: '福島県', akita: '秋田県',
  kanagawa: '神奈川県', tokyo: '東京都', saitama: '埼玉県', gunma: '群馬県', tochigi: '栃木県', ibaraki: '茨城県', chiba: '千葉県',
  niigata: '新潟県', toyama: '富山県', ishikawa: '石川県', fukui: '福井県', yamanashi: '山梨県', nagano: '長野県',
  gifu: '岐阜県', shizuoka: '静岡県', aichi: '愛知県',
  mie: '三重県', shiga: '滋賀県', kyoto: '京都府', osaka: '大阪府', hyogo: '兵庫県', nara: '奈良県', wakayama: '和歌山県',
  tokushima: '徳島県', kagawa: '香川県', ehime: '愛媛県', kochi: '高知県',
  tottori: '鳥取県', shimane: '島根県', okayama: '岡山県', hiroshima: '広島県', yamaguchi: '山口県',
  fukuoka: '福岡県', saga: '佐賀県', nagasaki: '長崎県', kumamoto: '熊本県', oita: '大分県',
  miyazaki: '宮崎県', kagoshima: '鹿児島県', okinawa: '沖縄県',
};

let cache = null;

function load() {
  if (cache) return cache;
  try { cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')); }
  catch { cache = {}; }
  return cache;
}

/** キャッシュをキー順にソートして書き出す（差分を読みやすく保つ） */
function save() {
  if (!cache) return;
  const sorted = {};
  for (const k of Object.keys(cache).sort()) sorted[k] = cache[k];
  try { fs.writeFileSync(CACHE_PATH, JSON.stringify(sorted, null, 2) + '\n', 'utf8'); }
  catch (e) { console.warn('[geocode] キャッシュ保存に失敗:', e.message); }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const round6 = n => Number(n.toFixed(6));

/** GSI 住所検索。ヒットなしは null、ネットワーク/JSON エラーは throw（再試行のため）。 */
async function gsiLookup(q) {
  const res = await fetch(GSI_URL + encodeURIComponent(q), {
    headers: { 'User-Agent': 'jsdf-chiiki-events/1.0 (weather geocoding)' },
  });
  if (!res.ok) throw new Error(`GSI HTTP ${res.status}`);
  const json = await res.json();
  const top = Array.isArray(json) && json[0];
  const coords = top && top.geometry && top.geometry.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null; // ヒットなし
  const [lon, lat] = coords;
  if (typeof lat !== 'number' || typeof lon !== 'number' || !isFinite(lat) || !isFinite(lon)) return null;
  return { lat, lon, title: (top.properties && top.properties.title) || q };
}

/**
 * キャッシュ付き検索。{lat,lon,title} か null を返す。
 * - ヒット/明確なヒットなし（空配列）→ キャッシュに保存
 * - ネットワーク等の一時エラー → キャッシュせず null（次回再試行）
 */
async function cachedLookup(q) {
  const key = (q || '').trim();
  if (!key) return null;
  const c = load();
  if (Object.prototype.hasOwnProperty.call(c, key)) return c[key]; // null（負のキャッシュ）も含む
  let result = null;
  try {
    result = await gsiLookup(key);
    c[key] = result; // ヒット・明確な無ヒットのみ保存
  } catch (e) {
    // 一時エラーはキャッシュしない（次回スクレイプで再試行）
    return null;
  }
  await sleep(POLITE_DELAY_MS);
  return result;
}

/** 「A・B」「A×B」のように複数会場が列挙される場合は先頭の会場名のみ使う */
function pickVenue(place) {
  if (!place || typeof place !== 'string') return '';
  return place.replace(/×/g, '・').split(/[・/、，,]/)[0].trim();
}

/** 住所文字列から「都道府県＋市区町村」を抽出（municipality 検索・label 用） */
function extractPrefMuni(s) {
  if (!s || typeof s !== 'string') return '';
  const m = s.match(/((?:北海道|(?:京都|大阪)府|(?:東京)都|.{2,3}県))?\s*([^\s0-9０-９]{1,8}?[市区町村郡])/);
  if (!m) return '';
  return `${m[1] || ''}${m[2] || ''}`.trim();
}

/**
 * 1イベントを weatherLocation へ変換。座標が取れなければ null。
 * address → venue → municipality → prefecture の順に試す。
 */
async function geocodeEvent(ev) {
  if (!ev || typeof ev !== 'object') return null;
  const attempts = [];
  if (ev.address) attempts.push(['address', ev.address]);
  const venue = pickVenue(ev.place);
  if (venue) attempts.push(['venue', venue]);
  const muni = extractPrefMuni(ev.address || ev.place);
  if (muni) attempts.push(['municipality', muni]);
  const pj = PREF_JP[ev.pref];
  if (pj) attempts.push(['prefecture', pj]);

  for (const [accuracy, q] of attempts) {
    const r = await cachedLookup(q);
    if (!r) continue;
    const label = extractPrefMuni(r.title) || extractPrefMuni(q) || PREF_JP[ev.pref] || (r.title || q).slice(0, 20);
    return { latitude: round6(r.lat), longitude: round6(r.lon), label, accuracy };
  }
  return null;
}

/**
 * events.json 形式（pref キー → イベント配列）の全イベントに weatherLocation を付与する。
 * - 終了済みイベント（終了日 < today）は天気を表示しないのでジオコーディングしない。
 * - キャッシュにより同一クエリは1回しか API を呼ばない。
 * @param {object} data    pref キー → イベント配列
 * @param {string} today   JST 今日 "YYYY-MM-DD"
 */
async function geocodeAll(data, today) {
  let added = 0, miss = 0, ended = 0;
  for (const key of Object.keys(data)) {
    if (!Array.isArray(data[key])) continue;
    for (const ev of data[key]) {
      if (!ev || !ev.date) continue;
      // 終了済みは天気を出さないためスキップ（無駄な API/キャッシュ生成を避ける）
      if ((ev.endDate || ev.date) < today) { ended++; continue; }
      // 手動入力で既に座標がある場合（accuracy: 'manual' 等）は尊重して上書きしない
      if (ev.weatherLocation && typeof ev.weatherLocation.latitude === 'number') continue;
      try {
        const loc = await geocodeEvent(ev);
        if (loc) { ev.weatherLocation = loc; added++; }
        else { miss++; }
      } catch (e) {
        miss++;
      }
    }
  }
  save();
  console.log(`[geocode] 付与 ${added} 件 / 失敗 ${miss} 件 / 終了済みスキップ ${ended} 件（キャッシュ ${Object.keys(load()).length} 件）`);
}

module.exports = { geocodeEvent, geocodeAll, load, save, PREF_JP };
