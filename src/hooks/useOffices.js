/**
 * useOffices.js — 近隣施設検索ユーティリティ
 *
 * Haversine 距離計算 + offices.json のキャッシュ付きフェッチを提供。
 * モジュールレベルキャッシュにより、複数回モーダルを開いても 1 回だけフェッチ。
 */

/** Haversine 距離計算（km）。2 点の緯度経度を受け取り直線距離を返す */
export function calcDistance(lat1, lng1, lat2, lng2) {
  const R    = 6371;
  const toRad = d => (d * Math.PI) / 180;
  const dLat  = toRad(lat2 - lat1);
  const dLng  = toRad(lng2 - lng1);
  const a     =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// モジュールレベルキャッシュ（SPA の生存期間中はリロードしない）
let _cache = null;

/** /data/offices.json をフェッチして offices 配列を返す（2 回目以降はキャッシュ）*/
export async function fetchOfficesData() {
  if (_cache) return _cache;
  const res = await fetch('/data/offices.json');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  _cache = json.offices ?? [];
  return _cache;
}
