// 交通・アクセス案内 — 純粋ロジック（管理API・公開API・画面・テストで共有）。
//
// 前提（2026-10-13 調査。詳細は docs/TRANSIT_API_2026-10.md）:
// - Google Maps Platform の経路API（Directions/Routes）は日本の公共交通経路を返さない（transit が ZERO_RESULTS）。
// - 国内の鉄道・バス経路API（駅すぱあと・NAVITIME・ジョルダン）は有料。承認なしに課金は発生させない。
// - そのため既定では「駅の候補を出す（国土数値情報の駅データ・端末内で計算）」＋
//   「Google マップの経路検索ページ（Maps URLs・APIキー不要）へ案内」で完結させ、
//   有料APIは /api/transit の差し替え口（provider）から後で接続できるようにしておく。
// - 運賃・所要時間・乗換回数は API から得た値だけを表示する。推測で作らない。
//   駅までの距離は「直線距離」と明記する（徒歩経路の距離・時間ではない）。
'use strict';

const JP_BOUNDS = { latMin: 20, latMax: 46.5, lonMin: 122, lonMax: 154 };
const STATION_SOURCE = '「国土数値情報（鉄道データ）」（国土交通省）を加工して作成';
const LIMITS = Object.freeze({ label: 60, station: 40, busStop: 60, notes: 300, url: 500 });

// 会場の座標として使ってよい精度（天気予報用の座標の accuracy）。市区町村・都道府県どまりは使わない
const PRECISE_ACCURACY = new Set(['address', 'venue', 'manual']);

function cleanText(input, maxLen) {
  let s = String(input ?? '');
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\u0000-\u001F\u007F​-‏‪-‮⁦-⁩﻿]/g, ' ');
  s = s.replace(/<|>/g, ch => (ch === '<' ? '＜' : '＞')).replace(/\s{2,}/g, ' ').trim();
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function inJapan(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon)
    && lat >= JP_BOUNDS.latMin && lat <= JP_BOUNDS.latMax && lon >= JP_BOUNDS.lonMin && lon <= JP_BOUNDS.lonMax;
}

/** 2点間の直線距離（m）。ハバーサイン */
function distanceM(lat1, lon1, lat2, lon2) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

/** 距離の表示（直線距離であることを呼び出し側で明記すること） */
function formatDistance(m) {
  if (!Number.isFinite(m)) return '';
  return m < 1000 ? `${Math.round(m / 10) * 10}m` : `${(m / 1000).toFixed(1)}km`;
}

/**
 * 近い駅の候補（純粋）。stations.json の形 { lines, stations:[[name,lat,lon,[lineIdx]]] } を受け取る。
 * 直線距離の近い順に limit 件（maxM より遠いものは出さない）。
 * ⚠ 最寄り駅を断定しない: 候補を複数返し、利用者に選ばせる。
 */
function nearestStations(data, lat, lon, { limit = 5, maxM = 5000 } = {}) {
  if (!data || !Array.isArray(data.stations) || !inJapan(lat, lon)) return [];
  // 緯度経度の粗い箱で先に絞る（全国9千駅を毎回ハバーサインしない）
  const dLat = maxM / 111000, dLon = maxM / (111000 * Math.cos(lat * Math.PI / 180));
  const out = [];
  for (const s of data.stations) {
    if (!Array.isArray(s) || s.length < 3) continue;
    const [name, sl, so, li] = s;
    if (Math.abs(sl - lat) > dLat || Math.abs(so - lon) > dLon) continue;
    const d = distanceM(lat, lon, sl, so);
    if (d > maxM) continue;
    const lines = (Array.isArray(li) ? li : []).map(i => data.lines && data.lines[i]).filter(Boolean)
      .map(([line, operator]) => ({ line, operator }));
    out.push({ name, lat: sl, lon: so, distanceM: d, lines });
  }
  return out.sort((a, b) => a.distanceM - b.distanceM).slice(0, limit);
}

/**
 * 運営の入力から「交通アクセス」設定を作る（純粋）。
 * 入場口の座標は日本の範囲の数値が両方そろったときだけ採用する。
 * @returns {{access: Object}|{error: string}}
 */
function normalizeAccessInput(raw) {
  if (raw == null) return { access: {} };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { error: '交通アクセスの形式が不正です' };
  const out = {};
  const label = cleanText(raw.entranceLabel, LIMITS.label);
  const latS = String(raw.entranceLat ?? '').trim(), lonS = String(raw.entranceLon ?? '').trim();
  if (latS || lonS) {
    const lat = Number(latS), lon = Number(lonS);
    if (!latS || !lonS || !inJapan(lat, lon)) return { error: '入場口の緯度・経度は両方を日本の範囲の数値で入力してください' };
    out.entrance = { lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5, label: label || '来場者用入口' };
  } else if (label) {
    out.entranceLabel = label;   // 座標なしでも「北門から入場」等の案内として出す
  }
  const station = cleanText(raw.station, LIMITS.station);
  if (station) out.station = station;
  const busStop = cleanText(raw.busStop, LIMITS.busStop);
  if (busStop) out.busStop = busStop;
  const notes = cleanText(raw.notes, LIMITS.notes);
  if (notes) out.notes = notes;
  const url = String(raw.url ?? '').trim();
  if (url) {
    if (!/^https?:\/\//i.test(url) || url.length > LIMITS.url) return { error: '公式アクセス案内のURLは http(s) で始めてください' };
    out.url = url;
  }
  return { access: out };
}

/** 公開してよい形（画面用の検証も兼ねる） */
function sanitizeAccess(a) {
  if (!a || typeof a !== 'object') return null;
  const r = normalizeAccessInput({
    entranceLabel: a.entrance ? a.entrance.label : a.entranceLabel,
    entranceLat: a.entrance ? a.entrance.lat : '', entranceLon: a.entrance ? a.entrance.lon : '',
    station: a.station, busStop: a.busStop, notes: a.notes, url: a.url,
  });
  if (r.error) return null;
  return Object.keys(r.access).length ? r.access : null;
}

/**
 * 経路の目的地を決める（純粋）。
 *   1. 運営が設定した入場口の座標
 *   2. 天気予報用の座標のうち、住所・会場名・手動で特定できたもの（市区町村・都道府県どまりは使わない）
 *   3. 住所 → 会場名（文字で検索させる）
 * @returns {{lat?:number, lon?:number, query?:string, label:string, basis:'entrance'|'venue'|'text'|'none'}}
 */
function resolveDestination(ev) {
  const acc = sanitizeAccess(ev && ev.access);
  if (acc && acc.entrance) return { lat: acc.entrance.lat, lon: acc.entrance.lon, label: acc.entrance.label, basis: 'entrance' };
  const wl = ev && ev.weatherLocation;
  if (wl && PRECISE_ACCURACY.has(wl.accuracy) && inJapan(Number(wl.latitude), Number(wl.longitude))) {
    return { lat: Number(wl.latitude), lon: Number(wl.longitude), label: ev.place || wl.label || '会場', basis: 'venue' };
  }
  const q = [ev && ev.address, ev && ev.place].map(x => String(x || '').trim()).find(Boolean);
  if (q) return { query: q, label: ev.place || q, basis: 'text' };
  return { label: '', basis: 'none' };
}

/** 地点 → Maps URLs の値（座標なら "lat,lon"、文字ならそのまま） */
function placeParam(p) {
  if (!p) return '';
  if (Number.isFinite(p.lat) && Number.isFinite(p.lon)) return `${p.lat},${p.lon}`;
  return String(p.query || '').trim();
}

/**
 * Google マップの経路検索ページ（Maps URLs。APIキー不要・公式の URL 形式）。
 * https://developers.google.com/maps/documentation/urls/get-started
 * origin を省くと Google マップ側が端末の現在地を使う。
 */
function googleDirectionsUrl({ origin, destination, mode = 'transit' }) {
  const dest = placeParam(destination);
  if (!dest) return '';
  const qs = new URLSearchParams({ api: '1', destination: dest, travelmode: mode });
  const o = placeParam(origin);
  if (o) qs.set('origin', o);
  return `https://www.google.com/maps/dir/?${qs.toString()}`;
}

// ── 経路APIの応答（/api/transit）の正規化 ───────────────────────────
// 有料APIを接続したときも画面は同じ形だけを扱う。API に無い値は持たない（表示もしない）。
const LEG_MODES = new Set(['walk', 'train', 'subway', 'bus', 'ferry', 'air', 'other']);
const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : undefined);

function sanitizeRoutes(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 5).map(r => {
    const s = (r && r.summary) || {};
    const summary = {};
    for (const k of ['durationMin', 'fareYen', 'transfers']) { const v = num(s[k]); if (v !== undefined && v >= 0) summary[k] = v; }
    for (const k of ['departure', 'arrival']) if (typeof s[k] === 'string' && /^\d{1,2}:\d{2}$/.test(s[k])) summary[k] = s[k];
    const legs = (Array.isArray(r && r.legs) ? r.legs : []).slice(0, 20).map(l => {
      const leg = { mode: LEG_MODES.has(l && l.mode) ? l.mode : 'other' };
      for (const k of ['line', 'from', 'to', 'direction']) { const t = cleanText(l && l[k], 60); if (t) leg[k] = t; }
      for (const k of ['departure', 'arrival']) if (l && typeof l[k] === 'string' && /^\d{1,2}:\d{2}$/.test(l[k])) leg[k] = l[k];
      const d = num(l && l.durationMin); if (d !== undefined && d >= 0) leg.durationMin = d;
      return leg;
    });
    return { summary, legs };
  }).filter(r => r.legs.length);
}

module.exports = {
  JP_BOUNDS, STATION_SOURCE, LIMITS, PRECISE_ACCURACY,
  inJapan, distanceM, formatDistance, nearestStations,
  normalizeAccessInput, sanitizeAccess, resolveDestination, googleDirectionsUrl, placeParam, sanitizeRoutes,
};
