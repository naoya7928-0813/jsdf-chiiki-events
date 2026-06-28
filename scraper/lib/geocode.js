// イベントの住所・会場名 → 緯度経度（ジオコーディング）
//
// 方針:
// - 国土地理院（GSI）住所検索 API を使う（無料・APIキー不要・日本の住所/施設名に強い）。
//   返却座標は [経度, 緯度] の順なので注意。
// - 精度（accuracy）は address > venue > municipality > prefecture の順に試し、最初のヒットを採用。
// - 会場名だけのキャッシュは同名会場・住所変更で誤座標を再利用するため、キャッシュキーは
//   pref + 正規化住所 + 正規化会場名（shared/weather.cjs の geocodeCacheKey）で生成し、
//   住所/会場名が変わったら別キーで再取得する。
// - 結果（weatherLocation）は scraper/geocode-cache.json にコミットして永続化。
//   1回の実行内では同一 GSI クエリをメモ化して重複呼び出しを避ける。
//
// 出力（events.json の各イベントへ保存する weatherLocation）:
//   { latitude, longitude, label, accuracy, source:'gsi', geocodedAt:ISO+09:00 }
//   accuracy: 'address' | 'venue' | 'municipality' | 'prefecture'（手動入力は 'manual'）
'use strict';

const fs = require('fs');
const path = require('path');
const W = require('../../shared/weather.cjs');

const CACHE_PATH = path.join(__dirname, '../geocode-cache.json');
const GSI_URL = 'https://msearch.gsi.go.jp/address-search/AddressSearch?q=';
const POLITE_DELAY_MS = 150;

// pref キー → 都道府県名（prefecture フォールバック・会場クエリの前置に使う）。
// 北海道の4方面隊キーは主要市名で代用する。
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

/** キャッシュをキー順にソートして書き出す（差分を読みやすく保つ）。 */
function save() {
  if (!cache) return;
  const sorted = {};
  for (const k of Object.keys(cache).sort()) sorted[k] = cache[k];
  try { fs.writeFileSync(CACHE_PATH, JSON.stringify(sorted, null, 2) + '\n', 'utf8'); }
  catch (e) { console.warn('[geocode] キャッシュ保存に失敗:', e.message); }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** GSI 住所検索（生）。ヒットなしは null、ネットワーク/JSON エラーは throw。 */
async function gsiLookupRaw(q) {
  const res = await fetch(GSI_URL + encodeURIComponent(q), {
    headers: { 'User-Agent': 'jsdf-chiiki-events/1.0 (weather geocoding)' },
  });
  if (!res.ok) throw new Error(`GSI HTTP ${res.status}`);
  const json = await res.json();
  const top = Array.isArray(json) && json[0];
  const coords = top && top.geometry && top.geometry.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const [lon, lat] = coords;
  if (typeof lat !== 'number' || typeof lon !== 'number' || !isFinite(lat) || !isFinite(lon)) return null;
  return { lat, lon, title: (top.properties && top.properties.title) || q };
}

/**
 * 1回の実行内で同一クエリの GSI 呼び出しをメモ化する lookup を作る。
 * 一時エラー時は null を返す（メモ化しない＝次回再試行余地を残す）。
 */
function makeMemoLookup() {
  const memo = new Map();
  return async function lookup(q) {
    const key = W.normalizeText(q);
    if (!key) return null;
    if (memo.has(key)) return memo.get(key);
    let r = null;
    try { r = await gsiLookupRaw(key); await sleep(POLITE_DELAY_MS); }
    catch { return null; } // 一時エラーはメモ化しない
    memo.set(key, r);
    return r;
  };
}

/** 「A・B」「A×B」のように複数会場が列挙される場合は先頭の会場名のみ。 */
function pickVenue(place) {
  if (!place || typeof place !== 'string') return '';
  return place.replace(/×/g, '・').split(/[・/、，,]/)[0].trim();
}

/** 住所/会場文字列から「都道府県＋市区町村」を抽出（municipality 検索・label 用）。 */
function extractPrefMuni(s) {
  if (!s || typeof s !== 'string') return '';
  const m = s.match(/((?:北海道|(?:京都|大阪)府|(?:東京)都|.{2,3}県))?\s*([^\s0-9０-９]{1,8}?[市区町村郡])/);
  if (!m) return '';
  return `${m[1] || ''}${m[2] || ''}`.trim();
}

/**
 * イベントの位置を解決する（純粋・lookupFn 注入でテスト可能）。
 * address → venue → municipality → prefecture の順に試し、最初のヒットを採用。
 * @param {object} ev
 * @param {(q:string)=>Promise<{lat,lon,title}|null>} lookupFn
 * @param {number} [now]
 * @returns {Promise<weatherLocation|null>}
 */
async function resolveLocation(ev, lookupFn, now = Date.now()) {
  if (!ev || typeof ev !== 'object') return null;
  const pj = PREF_JP[ev.pref];
  const attempts = [];
  if (ev.address) attempts.push(['address', ev.address]);
  const venue = pickVenue(ev.place);
  // 会場名は同名衝突を避けるため都道府県名を前置してから検索
  if (venue) attempts.push(['venue', pj ? `${pj} ${venue}` : venue]);
  const muni = extractPrefMuni(ev.address || ev.place);
  if (muni) attempts.push(['municipality', muni]);
  if (pj) attempts.push(['prefecture', pj]);

  for (const [accuracy, q] of attempts) {
    const r = await lookupFn(q);
    if (!r) continue;
    const label = extractPrefMuni(r.title) || extractPrefMuni(q) || pj || (r.title || q).slice(0, 20);
    return {
      latitude: W.roundCoord3(r.lat),
      longitude: W.roundCoord3(r.lon),
      label,
      accuracy,
      source: 'gsi',
      geocodedAt: W.isoJst(now),
    };
  }
  return null;
}

/**
 * events.json 形式（pref キー → イベント配列）の全イベントに weatherLocation を付与する。
 * - 終了済み（終了日 < today）はジオコーディングしない。
 * - キャッシュキーは pref+正規化住所+正規化会場名。住所/会場が変われば再取得。
 * - 完了時に accuracy 別の品質集計をログ出力し、前回比で異常があれば GitHub Actions 警告。
 * @param {object} data    pref キー → イベント配列
 * @param {string} today   JST 今日 "YYYY-MM-DD"
 */
async function geocodeAll(data, today) {
  const c = load();
  const lookup = makeMemoLookup();
  const counts = { address: 0, venue: 0, municipality: 0, prefecture: 0, manual: 0, missing: 0 };
  let active = 0, endedSkipped = 0;

  for (const key of Object.keys(data)) {
    if (!Array.isArray(data[key])) continue;
    for (const ev of data[key]) {
      if (!ev || !ev.date) continue;
      if ((ev.endDate || ev.date) < today) { endedSkipped++; continue; }
      active++;

      // 手動座標（accuracy:'manual'）は尊重して上書きしない
      if (ev.weatherLocation && ev.weatherLocation.accuracy === 'manual'
          && typeof ev.weatherLocation.latitude === 'number') {
        counts.manual++; continue;
      }

      const ckey = W.geocodeCacheKey(ev.pref, ev.address, ev.place);
      let loc;
      if (Object.prototype.hasOwnProperty.call(c, ckey)) {
        loc = c[ckey]; // null（負のキャッシュ）も含む
      } else {
        try { loc = await resolveLocation(ev, lookup); }
        catch { loc = null; }
        c[ckey] = loc; // 結果（null 含む）を永続化
      }

      if (loc && typeof loc.latitude === 'number') {
        ev.weatherLocation = loc;
        counts[loc.accuracy] = (counts[loc.accuracy] || 0) + 1;
      } else {
        counts.missing++;
      }
    }
  }

  save();
  logQuality(counts, active, today);
}

/** accuracy 別の品質集計ログ＋前回比の異常検知（GitHub Actions 警告）。 */
function logQuality(counts, active, today) {
  console.log('weatherLocation:');
  for (const k of ['address', 'venue', 'municipality', 'prefecture', 'manual', 'missing']) {
    console.log(`  ${k}: ${counts[k] || 0}`);
  }
  const ok = active - (counts.missing || 0);
  const rate = active > 0 ? ok / active : 1;
  console.log(`  （対象 ${active} 件 / 成功率 ${(rate * 100).toFixed(1)}%）`);

  // 前回データ（上書き前の events.json）と比較して急変を警告
  let prev = null;
  try { prev = collectAccuracyCounts(JSON.parse(fs.readFileSync(path.join(__dirname, '../../public/data/events.json'), 'utf8')), today); }
  catch { /* 初回など */ }

  const warn = (msg) => console.warn(`::warning title=weather-geocode::${msg}`);
  if ((counts.missing || 0) > 0) warn(`座標を取得できないイベントが ${counts.missing} 件あります`);
  if (rate < 0.9) warn(`ジオコーディング成功率が低下しています（${(rate * 100).toFixed(1)}%）`);
  if (prev) {
    if ((counts.prefecture || 0) > (prev.prefecture || 0) + 20 && (counts.prefecture || 0) > (prev.prefecture || 0) * 1.5) {
      warn(`prefecture 精度が急増しています（前回 ${prev.prefecture} → 今回 ${counts.prefecture}）`);
    }
    for (const k of ['address', 'venue']) {
      if ((prev[k] || 0) >= 5 && (counts[k] || 0) < (prev[k] || 0) * 0.6) {
        warn(`${k} 精度が大幅に減少しています（前回 ${prev[k]} → 今回 ${counts[k] || 0}）`);
      }
    }
  }
}

/** events.json（pref→配列）の未終了イベントから accuracy 別件数を集計。 */
function collectAccuracyCounts(data, today) {
  const counts = { address: 0, venue: 0, municipality: 0, prefecture: 0, manual: 0, missing: 0 };
  for (const key of Object.keys(data)) {
    if (!Array.isArray(data[key])) continue;
    for (const ev of data[key]) {
      if (!ev || !ev.date) continue;
      if ((ev.endDate || ev.date) < today) continue;
      const a = ev.weatherLocation && ev.weatherLocation.accuracy;
      if (a && counts[a] != null) counts[a]++;
      else if (a) counts[a] = 1;
      else counts.missing++;
    }
  }
  return counts;
}

module.exports = {
  geocodeAll, resolveLocation, collectAccuracyCounts,
  PREF_JP, pickVenue, extractPrefMuni, makeMemoLookup, save, load,
};
