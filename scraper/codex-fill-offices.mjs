/**
 * codex-fill-offices.mjs
 *
 * OpenAI Codex（gpt-4o）を使って、まだ局所窓口が未登録の地本について
 * 出張所・地域事務所・募集案内所の情報を補完し、
 * 国土地理院ジオコーディングAPIで座標変換したうえで
 * public/data/offices.json に追記する。
 *
 * 使用方法:
 *   node scraper/codex-fill-offices.mjs
 */

import fs      from 'fs';
import path    from 'path';
import { fileURLToPath } from 'url';
import OpenAI  from 'openai';
import 'dotenv/config';

const ROOT     = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_JSON = path.join(ROOT, 'public/data/offices.json');
const LOG_JSON = path.join(ROOT, 'scraper/codex-raw-responses.json');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const sleep  = ms => new Promise(r => setTimeout(r, ms));

// ── 地本マスタ（pref ID → 日本語名） ──────────────────────────
const TARGETS = [
  // 北海道（旭川・帯広・函館）
  { pref: 'asahikawa', label: '旭川地方協力本部' },
  { pref: 'obihiro',   label: '帯広地方協力本部' },
  { pref: 'hakodate',  label: '函館地方協力本部' },
  // 東北
  { pref: 'aomori',    label: '青森地方協力本部' },
  { pref: 'akita',     label: '秋田地方協力本部' },
  { pref: 'miyagi',    label: '宮城地方協力本部' },
  { pref: 'fukushima', label: '福島地方協力本部' },
  // 甲信越・北陸（不足分）
  { pref: 'toyama',    label: '富山地方協力本部' },
  { pref: 'nagano',    label: '長野地方協力本部' },
  { pref: 'gifu',      label: '岐阜地方協力本部' },
  // 東海・近畿
  { pref: 'shizuoka',  label: '静岡地方協力本部' },
  { pref: 'aichi',     label: '愛知地方協力本部' },
  { pref: 'mie',       label: '三重地方協力本部' },
  { pref: 'shiga',     label: '滋賀地方協力本部' },
  { pref: 'osaka',     label: '大阪地方協力本部' },
  { pref: 'hyogo',     label: '兵庫地方協力本部' },
  { pref: 'nara',      label: '奈良地方協力本部' },
  // 中国
  { pref: 'tottori',   label: '鳥取地方協力本部' },
  { pref: 'shimane',   label: '島根地方協力本部' },
  { pref: 'hiroshima', label: '広島地方協力本部' },
  { pref: 'yamaguchi', label: '山口地方協力本部' },
  // 四国
  { pref: 'kagawa',    label: '香川地方協力本部' },
  { pref: 'ehime',     label: '愛媛地方協力本部' },
  // 九州
  { pref: 'fukuoka',   label: '福岡地方協力本部' },
  { pref: 'nagasaki',  label: '長崎地方協力本部' },
  { pref: 'oita',      label: '大分地方協力本部' },
  { pref: 'miyazaki',  label: '宮崎地方協力本部' },
  { pref: 'okinawa',   label: '沖縄地方協力本部' },
  // 件数不足分
  { pref: 'gunma',     label: '群馬地方協力本部' },
  { pref: 'iwate',     label: '岩手地方協力本部' },
  { pref: 'niigata',   label: '新潟地方協力本部' },
  { pref: 'yamagata',  label: '山形地方協力本部' },
  { pref: 'kyoto',     label: '京都地方協力本部' },
  { pref: 'saga',      label: '佐賀地方協力本部' },
  { pref: 'fukui',     label: '福井地方協力本部' },
];

// ── Codex へのプロンプト ────────────────────────────────────
function buildPrompt(label) {
  return `自衛隊「${label}」の下部組織（出張所・地域事務所・募集案内所・分駐所・駐在員事務所）の一覧を教えてください。

以下のJSON配列のみを返してください（余分な文章は不要）:
[
  {
    "name": "○○出張所",
    "office_type": "出張所",
    "address": "都道府県から始まる正確な住所",
    "phone": "0XX-XXX-XXXX",
    "area": "担当する市区町村の列挙（スペース区切り）"
  }
]

注意:
- office_type は「出張所」「地域事務所」「募集案内所」「分駐所」「駐在員事務所」のいずれか
- 住所は都道府県名から始めること
- 不明な項目は空文字列 "" にすること
- 本部自体は含めず、下部組織のみを列挙すること
- 知らない情報は含めず、確実に存在する窓口のみ記載してください`;
}

// ── 国土地理院ジオコーディング ────────────────────────────
async function geocode(address) {
  if (!address?.trim() || !/[一-鿿぀-ヿ]/.test(address)) return null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const url = `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(address.trim())}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) { await sleep(800); continue; }
      const data = await res.json();
      if (!Array.isArray(data) || !data.length) return null;
      const [lng, lat] = data[0].geometry.coordinates;
      return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
    } catch { await sleep(800); }
  }
  return null;
}

function toType(office_type) {
  if (/協力/.test(office_type)) return 'cooperation';
  return 'recruitment';
}

// ── Codex API 呼び出し ─────────────────────────────────────
async function askCodex(label) {
  const res = await openai.chat.completions.create({
    model:           'gpt-4o',
    temperature:     0.1,
    response_format: { type: 'json_object' },
    messages: [
      {
        role:    'system',
        content: '自衛隊の施設情報に詳しい専門家です。確実に存在する情報のみを正確なJSON形式で回答してください。',
      },
      {
        role:    'user',
        content: buildPrompt(label),
      },
    ],
  });

  const text = res.choices[0].message.content ?? '{}';
  try {
    const parsed = JSON.parse(text);
    // JSON object 形式で返ってきた場合に配列を抽出
    if (Array.isArray(parsed)) return parsed;
    const key = Object.keys(parsed).find(k => Array.isArray(parsed[k]));
    return key ? parsed[key] : [];
  } catch {
    console.warn('  ⚠️  JSONパースエラー:', text.slice(0, 100));
    return [];
  }
}

// ── メイン ──────────────────────────────────────────────────
async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY が設定されていません');
    process.exit(1);
  }

  console.log('📂 既存 offices.json 読み込み...');
  const existing   = JSON.parse(fs.readFileSync(OUT_JSON, 'utf8'));
  const existNames = new Set(existing.offices.map(o => o.name));
  const hqByPref   = Object.fromEntries(
    existing.offices.filter(o => o.type === 'hq').map(o => [o.pref, o])
  );

  let maxIdx = 0;
  for (const o of existing.offices) {
    const m = o.id?.match(/\d+$/);
    if (m) maxIdx = Math.max(maxIdx, parseInt(m[0], 10));
  }

  const rawLog    = {};   // Codex の生レスポンス保存
  const allNew    = [];
  let totalGeo    = 0, totalFallback = 0, totalSkip = 0, totalDupe = 0;

  console.log(`\n🤖 OpenAI Codex で ${TARGETS.length} 地本を補完中...\n`);

  for (const { pref, label } of TARGETS) {
    console.log(`─── ${label} (${pref}) ───`);
    const parentHq = hqByPref[pref];

    let offices = [];
    try {
      offices = await askCodex(label);
      rawLog[pref] = offices;
      console.log(`  Codex → ${offices.length} 件取得`);
    } catch (err) {
      console.warn(`  ⚠️  Codex エラー: ${err.message}`);
      await sleep(2000);
      continue;
    }

    for (let i = 0; i < offices.length; i++) {
      const lo = offices[i];
      if (!lo.name) { totalSkip++; continue; }
      if (existNames.has(lo.name)) {
        console.log(`    重複スキップ: ${lo.name}`);
        totalDupe++;
        continue;
      }

      let lat = null, lng = null, latApprox = false;

      if (lo.address?.trim()) {
        process.stdout.write(`    ジオコード: ${lo.name} ... `);
        const c = await geocode(lo.address);
        if (c) {
          lat = c.lat; lng = c.lng; totalGeo++;
          console.log(`✓ (${lat}, ${lng})`);
        } else {
          console.log('✗');
        }
        await sleep(300);
      }

      if (lat === null && parentHq) {
        const offset = ((i % 9) - 4) * 0.004;
        lat = Math.round((parentHq.lat + offset) * 1e6) / 1e6;
        lng = Math.round((parentHq.lng + offset * 1.3) * 1e6) / 1e6;
        latApprox = true;
        totalFallback++;
        console.log(`    フォールバック: ${lo.name}`);
      }

      if (lat === null) { totalSkip++; continue; }

      const idx = maxIdx + allNew.length + 1;
      const entry = {
        id:      `loc-${pref}-c${idx}`,
        type:    toType(lo.office_type ?? ''),
        pref,
        name:    lo.name,
        address: lo.address ?? '',
        lat, lng,
        tel:     lo.phone ?? '',
        url:     hqByPref[pref]?.url ?? '',
        area:    lo.area ?? '',
        ...(latApprox ? { latApprox: true } : {}),
      };
      allNew.push(entry);
      existNames.add(lo.name);
    }

    await sleep(1200); // OpenAI APIレート制限対策
  }

  // Codex 生レスポンスをログ保存
  fs.writeFileSync(LOG_JSON, JSON.stringify(rawLog, null, 2), 'utf8');
  console.log(`\n💾 Codex生レスポンス → ${LOG_JSON}`);

  // offices.json 更新
  const updated = {
    ...existing,
    updatedAt: new Date().toISOString().slice(0, 10),
    note: '地本50件＋地域事務所・募集案内所等（関東圏＋Codex補完）。座標はジオコーディング済み（latApprox=trueは親地本座標で近似）。',
    offices: [...existing.offices, ...allNew],
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(updated, null, 2), 'utf8');

  console.log('\n════════════════════════════════');
  console.log(`✅ ジオコード成功 : ${totalGeo} 件`);
  console.log(`↩  フォールバック : ${totalFallback} 件`);
  console.log(`⏭  重複スキップ  : ${totalDupe} 件`);
  console.log(`✗  除外          : ${totalSkip} 件`);
  console.log(`📝 新規追加      : ${allNew.length} 件`);
  console.log(`📊 offices.json 合計: ${updated.offices.length} 件`);
  console.log('════════════════════════════════');
}

main().catch(err => { console.error('❌', err); process.exit(1); });
