// events.json のデータ品質チェック（CIゲート）。
// errors があれば exit 1（デプロイ停止）。warnings は表示のみ。
// 前回（git HEAD）のイベント総数と比較して異常減少も検出する。
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dq from '../shared/dataQuality.cjs';

const { validateEventsData } = dq;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EVENTS = path.join(root, 'public/data/events.json');

function readJson(p) {
  return JSON.parse(readFileSync(p, 'utf8'));
}

/** 直前コミットの events.json の総数（取得できなければ null）。 */
function prevTotal() {
  try {
    const raw = execSync('git show HEAD:public/data/events.json', { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const data = JSON.parse(raw);
    let n = 0;
    for (const k of Object.keys(data)) if (Array.isArray(data[k])) n += data[k].length;
    return n;
  } catch { return null; }
}

let data;
try { data = readJson(EVENTS); }
catch (e) { console.error(`[data-quality] events.json を読めません: ${e.message}`); process.exit(1); }

const { errors, warnings, total, byAccuracy } = validateEventsData(data, { prevTotal: prevTotal() });

console.log(`[data-quality] イベント総数: ${total}`);
console.log(`[data-quality] 座標精度: ${JSON.stringify(byAccuracy)}`);

if (warnings.length) {
  console.log(`\n[data-quality] 警告 ${warnings.length} 件:`);
  for (const w of warnings.slice(0, 100)) console.log(`  ⚠ ${w}`);
  if (warnings.length > 100) console.log(`  …他 ${warnings.length - 100} 件`);
  // GitHub Actions のアノテーション
  if (process.env.GITHUB_ACTIONS) console.log(`::warning title=data-quality::品質警告 ${warnings.length} 件（詳細はログ参照）`);
}

if (errors.length) {
  console.error(`\n[data-quality] エラー ${errors.length} 件（デプロイを停止します）:`);
  for (const e of errors.slice(0, 200)) console.error(`  ✖ ${e}`);
  if (process.env.GITHUB_ACTIONS) console.error(`::error title=data-quality::品質エラー ${errors.length} 件でデプロイを停止`);
  process.exit(1);
}

console.log('\n[data-quality] OK（エラーなし）');
