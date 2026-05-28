/**
 * add-kanto-offices.mjs
 *
 * kanto-offices.json を読み込み、国土地理院ジオコーディングAPIで
 * 住所→緯度経度に変換して public/data/offices.json に追記する。
 *
 * 使用方法:
 *   node scraper/add-kanto-offices.mjs
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT     = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_JSON = path.join(ROOT, 'scraper/kanto-offices.json');
const OUT_JSON = path.join(ROOT, 'public/data/offices.json');

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── 国土地理院ジオコーディング ────────────────────────────────
async function geocode(address) {
  if (!address || !address.trim()) return null;
  if (!/[一-鿿぀-ヿ]/.test(address)) return null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const url = `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(address.trim())}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) { await sleep(1000); continue; }
      const data = await res.json();
      if (!Array.isArray(data) || !data.length) return null;
      const [lng, lat] = data[0].geometry.coordinates;
      return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
    } catch {
      await sleep(1000);
    }
  }
  return null;
}

// ── office_type → type 変換 ─────────────────────────────────
function toType(office_type) {
  if (/協力案内所/.test(office_type)) return 'cooperation';
  return 'recruitment'; // 募集案内所 / 地域事務所 / 出張所 / 分駐所
}

// ── メイン ──────────────────────────────────────────────────
async function main() {
  console.log('📂 既存 offices.json 読み込み...');
  const existing = JSON.parse(fs.readFileSync(OUT_JSON, 'utf8'));

  // 既存IDセット（重複防止）
  const existingNames = new Set(existing.offices.map(o => o.name));

  // 既存地本の座標マップ（フォールバック用）
  const hqByPref = {};
  for (const o of existing.offices) {
    if (o.type === 'hq') hqByPref[o.pref] = o;
  }

  // 既存の最大インデックスを取得
  let maxIdx = 0;
  for (const o of existing.offices) {
    const m = o.id?.match(/loc-\w+-(\d+)$/);
    if (m) maxIdx = Math.max(maxIdx, parseInt(m[1], 10));
  }
  console.log(`   既存窓口 最大インデックス: ${maxIdx}`);

  console.log('\n📂 関東窓口ソース読み込み...');
  const src = JSON.parse(fs.readFileSync(SRC_JSON, 'utf8'));
  console.log(`   対象: ${src.length} 件`);

  console.log('\n🌐 ジオコーディング開始...');
  let geocoded = 0, fallback = 0, skipped = 0, dupes = 0;
  const newOffices = [];

  for (let i = 0; i < src.length; i++) {
    const lo = src[i];

    // 重複チェック
    if (existingNames.has(lo.name)) {
      console.log(`  [${i + 1}/${src.length}] ${lo.name} → 既存スキップ`);
      dupes++;
      continue;
    }

    const parentHq = hqByPref[lo.parent_pco_id];
    let lat = null, lng = null, latApprox = false;

    // ジオコーディング
    if (lo.address && lo.address.trim()) {
      process.stdout.write(`  [${i + 1}/${src.length}] ${lo.name} → ジオコード中...`);
      const coords = await geocode(lo.address);
      if (coords) {
        lat = coords.lat;
        lng = coords.lng;
        geocoded++;
        console.log(` ✓ (${lat}, ${lng})`);
      } else {
        console.log(` ✗ 失敗`);
      }
      await sleep(350);
    }

    // フォールバック: 親地本座標 + オフセット
    if (lat === null && parentHq) {
      const offset = ((i % 9) - 4) * 0.004;
      lat = Math.round((parentHq.lat + offset) * 1e6) / 1e6;
      lng = Math.round((parentHq.lng + offset * 1.3) * 1e6) / 1e6;
      latApprox = true;
      fallback++;
      console.log(`  [${i + 1}/${src.length}] ${lo.name} → 親地本フォールバック`);
    }

    if (lat === null) { skipped++; continue; }

    const idx = maxIdx + newOffices.length + 1;
    newOffices.push({
      id:      `loc-${lo.parent_pco_id}-k${idx}`,
      type:    toType(lo.office_type),
      pref:    lo.parent_pco_id,
      name:    lo.name,
      address: lo.address ?? '',
      lat,
      lng,
      tel:     lo.phone   ?? '',
      url:     lo.url     ?? parentHq?.url ?? '',
      area:    lo.area    ?? '',
      ...(latApprox ? { latApprox: true } : {}),
    });
  }

  console.log(`\n✅ ジオコード: ${geocoded} 件 / フォールバック: ${fallback} 件 / 重複スキップ: ${dupes} 件 / 除外: ${skipped} 件`);
  console.log(`   追加: ${newOffices.length} 件`);

  // 出力
  const updated = {
    ...existing,
    updatedAt: new Date().toISOString().slice(0, 10),
    note: '地本50件＋地域事務所・募集案内所等（関東圏含む）。座標はジオコーディング済み（latApprox=trueは親地本座標で近似）。',
    offices: [...existing.offices, ...newOffices],
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(updated, null, 2), 'utf8');
  console.log(`\n📝 offices.json 更新完了`);
  console.log(`   合計: ${updated.offices.length} 件`);

  // 追加分のサマリー
  console.log('\n追加した窓口:');
  for (const o of newOffices) {
    console.log(`  ${o.pref.padEnd(12)} ${o.name}`);
  }
}

main().catch(err => { console.error('❌', err); process.exit(1); });
