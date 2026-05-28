/**
 * build-offices.mjs
 *
 * 自衛隊地方協力本部_公開窓口情報.json を読み込み、
 * 国土地理院ジオコーディングAPI で住所→緯度経度に変換して
 * public/data/offices.json を更新する。
 *
 * 使用方法:
 *   node scraper/build-offices.mjs
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT    = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_JSON = 'C:/Users/user/OneDrive/Desktop/自衛隊地方協力本部_公開窓口情報.json';
const OUT_JSON = path.join(ROOT, 'public/data/offices.json');

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── 国土地理院ジオコーディング（最大リトライ2回）──────────────
async function geocode(address) {
  if (!address || !address.trim()) return null;
  // 番号や記号だけの住所はスキップ
  if (!/[一-鿿぀-ヿ]/.test(address)) return null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const url = `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(address.trim())}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
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

// ── office_type → type 変換 ────────────────────────────────────
function toType(office_type) {
  if (/募集案内所/.test(office_type)) return 'recruitment';
  if (/協力案内所/.test(office_type)) return 'cooperation';
  return 'recruitment'; // 地域事務所・出張所・派遣所・地域部・駐在員事務所 など
}

// ── PDFリンクを除外 ────────────────────────────────────────────
function sanitizeUrl(url, parentUrl) {
  if (!url) return parentUrl ?? '';
  if (url.endsWith('.pdf') || url.endsWith('.PDF')) return parentUrl ?? '';
  return url;
}

// ── ID 生成 ───────────────────────────────────────────────────
function makeId(parentPcoId, name, idx) {
  const slug = name
    .replace(/\s/g, '')
    .replace(/[^\w぀-鿿]/g, '')
    .substring(0, 8);
  return `loc-${parentPcoId}-${idx}`;
}

// ─────────────────────────────────────────────────────────────
// メイン
// ─────────────────────────────────────────────────────────────
async function main() {
  console.log('📂 既存 offices.json 読み込み...');
  const existing = JSON.parse(fs.readFileSync(OUT_JSON, 'utf8'));

  // 既存の地本を pref（=PCO ID）でマップ化
  const hqByPref = {};
  for (const o of existing.offices) {
    if (o.type === 'hq') hqByPref[o.pref] = o;
  }
  console.log(`   地本 ${Object.keys(hqByPref).length} 件を取得`);

  console.log('\n📂 新規ソース JSON 読み込み...');
  const src = JSON.parse(fs.readFileSync(SRC_JSON, 'utf8'));
  const locals = src.local_and_recruiting_offices;
  console.log(`   対象窓口: ${locals.length} 件`);

  // ── 既存の地本情報をソースデータで補完（tel・address の精度向上）
  console.log('\n🔄 既存地本データを最新ソースで補完中...');
  for (const srcHq of src.provincial_cooperation_offices) {
    const existing_hq = hqByPref[srcHq.id];
    if (!existing_hq) continue;
    // 電話番号の更新（ソースの方が正確な場合がある）
    if (srcHq.phone && srcHq.phone !== existing_hq.tel) {
      console.log(`  ${srcHq.id}: tel ${existing_hq.tel} → ${srcHq.phone}`);
      existing_hq.tel = srcHq.phone;
    }
  }

  // ── 既存の局所窓口は一旦削除してリビルド
  const hqOffices  = existing.offices.filter(o => o.type === 'hq');
  const newLocals  = [];

  console.log('\n🌐 ジオコーディング開始...');
  let geocoded = 0, fallback = 0, skipped = 0;

  for (let i = 0; i < locals.length; i++) {
    const lo = locals[i];
    const parentHq = hqByPref[lo.parent_pco_id];

    // 名前なしはスキップ
    if (!lo.name) { skipped++; continue; }

    // 有用な情報がまったくない場合もスキップ
    const hasUseful = lo.address || lo.phone || lo.area;
    if (!hasUseful) { skipped++; continue; }

    let lat = null, lng = null, latApprox = false;

    // 住所があればジオコード
    if (lo.address && lo.address.trim()) {
      process.stdout.write(`  [${i + 1}/${locals.length}] ${lo.name} → ジオコード中...`);
      const coords = await geocode(lo.address);
      if (coords) {
        lat = coords.lat;
        lng = coords.lng;
        geocoded++;
        console.log(` ✓ (${lat}, ${lng})`);
      } else {
        console.log(` ✗ 失敗`);
      }
      await sleep(300); // API レート制限回避
    }

    // 住所なし or ジオコード失敗 → 親地本の座標を使用（±小オフセット）
    if (lat === null && parentHq) {
      const offset = ((i % 9) - 4) * 0.005; // −0.02 〜 +0.02 deg
      lat = Math.round((parentHq.lat + offset) * 1e6) / 1e6;
      lng = Math.round((parentHq.lng + offset * 1.3) * 1e6) / 1e6;
      latApprox = true;
      fallback++;
      console.log(`  [${i + 1}/${locals.length}] ${lo.name} → 親地本座標フォールバック`);
    }

    if (lat === null) { skipped++; continue; } // 親地本も見つからない場合はスキップ

    const parentUrl = parentHq?.url ?? '';
    const officeUrl = sanitizeUrl(lo.url, parentUrl);

    newLocals.push({
      id:        makeId(lo.parent_pco_id, lo.name, i),
      type:      toType(lo.office_type),
      pref:      lo.parent_pco_id,       // 親地本のPCO ID（regionMapと対応）
      name:      lo.name,
      address:   lo.address ?? '',
      lat,
      lng,
      tel:       lo.phone   ?? '',
      url:       officeUrl,
      area:      lo.area    ?? '',
      ...(latApprox ? { latApprox: true } : {}),
    });
  }

  console.log(`\n✅ ジオコード: ${geocoded} 件 / 親地本フォールバック: ${fallback} 件 / スキップ: ${skipped} 件`);

  // ── 出力データを構築
  const updated = {
    ...existing,
    updatedAt: new Date().toISOString().slice(0, 10),
    note: '地本50件＋地域事務所・募集案内所等。座標はジオコーディング済み（latApprox=trueは親地本座標で近似）。',
    offices: [...hqOffices, ...newLocals],
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(updated, null, 2), 'utf8');
  console.log(`\n📝 offices.json を更新しました`);
  console.log(`   地本: ${hqOffices.length} 件`);
  console.log(`   窓口: ${newLocals.length} 件`);
  console.log(`   合計: ${updated.offices.length} 件`);
}

main().catch(err => { console.error('❌', err); process.exit(1); });
