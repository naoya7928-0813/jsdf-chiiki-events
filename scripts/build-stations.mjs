#!/usr/bin/env node
/**
 * build-stations — 交通アクセス案内で使う全国の鉄道駅データ（public/data/stations.json）を作る
 *
 * 出典: 国土交通省「国土数値情報（鉄道データ）」N02（CC BY 4.0）
 *   https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N02-2025.html
 *   画面とこのファイルに「『国土数値情報（鉄道データ）』（国土交通省）を加工して作成」と表示する。
 *
 * 使い方（データ更新は年1回程度。スクレイプ毎には実行しない）:
 *   1. 上のページから N02-25_GML.zip を取得して展開する
 *   2. node scripts/build-stations.mjs <展開先>/N02-25_GML/UTF-8/N02-25_Station.geojson
 *
 * 加工内容:
 *   - 同じ駅（駅コードのグループ N02_005g）を1件にまとめ、乗り入れ路線を併記する
 *   - 位置はホームの線分の中点の平均（駅舎・出入口の位置ではない＝徒歩経路は地図で確認させる）
 *   - 座標は小数5桁（約1m）に丸める
 * 出力形式（容量を抑えるため配列）:
 *   { v, source, lines: [[路線名, 事業者名], …], stations: [[駅名, 緯度, 経度, [路線index…]], …] }
 */
import fs from 'node:fs';
import path from 'node:path';

const src = process.argv[2];
if (!src || !fs.existsSync(src)) {
  console.error('使い方: node scripts/build-stations.mjs <N02-xx_Station.geojson>');
  process.exit(1);
}
const geo = JSON.parse(fs.readFileSync(src, 'utf8'));
const round = (n) => Math.round(n * 1e5) / 1e5;

const lineIndex = new Map();
const lines = [];
const groups = new Map();
for (const f of geo.features || []) {
  const p = f.properties || {};
  const name = String(p.N02_005 || '').trim();
  const gid = String(p.N02_005g || p.N02_005c || name);
  const coords = f.geometry && f.geometry.type === 'LineString' ? f.geometry.coordinates : null;
  if (!name || !coords || !coords.length) continue;
  const mid = coords[Math.floor((coords.length - 1) / 2)];
  const last = coords[Math.ceil((coords.length - 1) / 2)];
  const lon = (mid[0] + last[0]) / 2, lat = (mid[1] + last[1]) / 2;
  const lineKey = `${p.N02_003}|${p.N02_004}`;
  if (!lineIndex.has(lineKey)) { lineIndex.set(lineKey, lines.length); lines.push([String(p.N02_003 || ''), String(p.N02_004 || '')]); }
  const g = groups.get(gid) || { name, lat: 0, lon: 0, n: 0, lines: new Set() };
  g.lat += lat; g.lon += lon; g.n++;
  g.lines.add(lineIndex.get(lineKey));
  groups.set(gid, g);
}

const stations = [...groups.values()]
  .map(g => [g.name, round(g.lat / g.n), round(g.lon / g.n), [...g.lines].sort((a, b) => a - b)])
  .sort((a, b) => a[1] - b[1] || a[2] - b[2]);

const out = {
  v: 1,
  source: '「国土数値情報（鉄道データ）」（国土交通省）を加工して作成（CC BY 4.0）',
  sourceFile: path.basename(src),
  lines,
  stations,
};
const dest = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'public', 'data', 'stations.json');
fs.writeFileSync(dest, JSON.stringify(out));
console.log(`[stations] ${stations.length} 駅 / ${lines.length} 路線 → ${dest}（${(fs.statSync(dest).size / 1024).toFixed(0)} KB）`);
