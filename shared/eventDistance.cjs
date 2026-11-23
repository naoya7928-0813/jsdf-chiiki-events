'use strict';
/**
 * 現在地からイベント会場までの距離（一覧の「現在地から近い順」。2026-11-23 導入）。
 *
 * - 計算は端末内だけで行う。現在地はサーバーへ送らず、保存もしない（画面の状態にだけ持つ）
 * - 距離は「直線距離」。画面にも必ずそう書く（道のり・所要時間ではない）
 * - 会場の位置は events.json の weatherLocation（国土地理院の住所検索）か、運営が設定した入口の座標。
 *   都道府県の代表地点（accuracy: prefecture）は会場の位置ではないので使わない＝推測で並べない
 * - 会場名検索の座標は「地本の都道府県名を前置して」引いているため、会場名に別の都道府県名
 *   （「青森県の三沢基地」等）があるときは信用しない（shared/eventPage.cjs の開催地判定と同じ考え方）
 */

const { distanceM, formatDistance, inJapan } = require('./transit.cjs');

const TRUSTED_ACCURACY = new Set(['address', 'venue', 'municipality', 'manual']);
const OTHER_PREF_RE = /(北海道|青森|岩手|宮城|秋田|山形|福島|茨城|栃木|群馬|埼玉|千葉|東京|神奈川|新潟|富山|石川|福井|山梨|長野|岐阜|静岡|愛知|三重|滋賀|京都|大阪|兵庫|奈良|和歌山|鳥取|島根|岡山|広島|山口|徳島|香川|愛媛|高知|福岡|佐賀|長崎|熊本|大分|宮崎|鹿児島|沖縄)(都|道|府|県)|^県の|[^都道府]県の/;

/** 選べる半径（km）。0 は「すべて（近い順に並べるだけ）」 */
const RADIUS_OPTIONS_KM = Object.freeze([0, 10, 30, 50, 100]);

/**
 * 会場の座標 { lat, lon, approx } か null。approx は市区町村レベル（会場そのものではない）。
 */
function eventCoords(ev) {
  if (!ev) return null;
  // 運営が設定した入口の座標（手動入力＝最も確か）
  const ent = ev.access && ev.access.entrance;
  if (ent && inJapan(Number(ent.latitude), Number(ent.longitude))) {
    return { lat: Number(ent.latitude), lon: Number(ent.longitude), approx: false };
  }
  const wl = ev.weatherLocation;
  if (!wl || !TRUSTED_ACCURACY.has(wl.accuracy)) return null;
  const lat = Number(wl.latitude), lon = Number(wl.longitude);
  if (!inJapan(lat, lon)) return null;
  const biased = wl.accuracy === 'venue' || wl.accuracy === 'municipality';
  if (biased && OTHER_PREF_RE.test(String(ev.place || ''))) return null;
  return { lat, lon, approx: wl.accuracy === 'municipality' };
}

/**
 * 現在地から近い順に並べる。会場の位置が分からないイベントは外し、件数を返す。
 * @param {Array} events
 * @param {{lat:number, lon:number}} origin
 * @param {number} radiusKm 0 なら半径で絞らない
 * @returns {{ list: Array<object & {distanceM:number, distanceApprox:boolean}>, unknown: number }}
 */
function sortByDistance(events, origin, radiusKm = 0) {
  if (!origin || !inJapan(Number(origin.lat), Number(origin.lon))) return { list: [], unknown: 0 };
  let unknown = 0;
  const list = [];
  for (const ev of events || []) {
    const c = eventCoords(ev);
    if (!c) { unknown++; continue; }
    const d = distanceM(origin.lat, origin.lon, c.lat, c.lon);
    if (radiusKm > 0 && d > radiusKm * 1000) continue;
    list.push({ ...ev, distanceM: d, distanceApprox: c.approx });
  }
  list.sort((a, b) => a.distanceM - b.distanceM || String(a.date).localeCompare(String(b.date)));
  return { list, unknown };
}

/** 表示用「約12.3km（直線）」。市区町村レベルの位置なら「市区町村の中心まで」と分かるようにする */
function distanceLabel(ev) {
  if (!ev || !Number.isFinite(ev.distanceM)) return '';
  return `約${formatDistance(ev.distanceM)}（直線${ev.distanceApprox ? '・市区町村の中心まで' : ''}）`;
}

module.exports = { RADIUS_OPTIONS_KM, eventCoords, sortByDistance, distanceLabel, TRUSTED_ACCURACY };
