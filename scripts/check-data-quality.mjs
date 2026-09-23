// events.json のデータ品質チェック（CIゲート）。
// errors があれば exit 1（コミット・デプロイ停止）。warnings は表示のみ。
//
// 構造検査に加えて、前回（git HEAD）の events.json 全体と比較し、
//   - 地本単位の未終了イベント数の急減・0件化
//   - 同一イベントの重要項目（time/place/締切/年齢条件/座標 等）の消失
//   - 未終了イベントの原因不明な消失
//   - 全国総数の急減（補助）
// を検出する（判定は shared/eventRegression.cjs・shared/dataQuality.cjs に集約）。
// 「JSONとして正しい」だけでは合格にしない。前回より不自然に悪化していないことも確認する。
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dq from '../shared/dataQuality.cjs';

const { validateEventsData } = dq;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EVENTS = path.join(root, 'public/data/events.json');
const QUARANTINE = path.join(root, 'public/data/events-quarantine.json');
const LLM_RECHECK = path.join(root, 'public/data/events-llm-recheck.json');
const REGRESSION_REPORT = path.join(root, 'scraper/regression-report.json');

function readJson(p) {
  return JSON.parse(readFileSync(p, 'utf8'));
}
function readJsonOr(p, fallback) {
  try { return existsSync(p) ? readJson(p) : fallback; } catch { return fallback; }
}

/** 直前コミットの events.json 全体（取得できなければ null）。 */
function readPrevData() {
  try {
    const raw = execSync('git show HEAD:public/data/events.json', {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 256 * 1024 * 1024,
    });
    return JSON.parse(raw);
  } catch { return null; }
}
const countEvents = (d) => Object.values(d || {}).filter(Array.isArray).reduce((n, a) => n + a.length, 0);

let data;
try { data = readJson(EVENTS); }
catch (e) { console.error(`[data-quality] events.json を読めません: ${e.message}`); process.exit(1); }

const prevData = readPrevData();
const quarantine = readJsonOr(QUARANTINE, { events: [] });
const quarantineIds = new Set((quarantine.events || []).map(e => e.id));

const { errors, warnings, total, byAccuracy, regression } = validateEventsData(data, {
  prevTotal: prevData ? countEvents(prevData) : undefined,
  prevData: prevData || undefined,
  quarantineIds,
});

// LLM 再検査: 要再検査なのに1件も再検査していない場合は、理由別件数の合計が一致すること
// （「flagged > 0 なのに attempted = 0」の理由が追えない状態を防ぐ）
const llm = readJsonOr(LLM_RECHECK, null);
if (llm && llm.summary) {
  const s = llm.summary;
  if (s.flagged > 0 && s.attempted === 0) {
    const reasons = ['skippedNoSource', 'skippedNotEligible', 'skippedProviderUnavailable', 'skippedCutoff', 'overBudget']
      .reduce((n, k) => n + (Number(s[k]) || 0), 0);
    if (reasons !== s.flagged) warnings.push(`LLM再検査: 要再検査 ${s.flagged} 件に対し、見送り理由の合計が ${reasons} 件で一致しません`);
  }
}

console.log(`[data-quality] イベント総数: ${total}${prevData ? `（前回 ${countEvents(prevData)}）` : ''}`);
console.log(`[data-quality] 座標精度: ${JSON.stringify(byAccuracy)}`);
if (regression) console.log(`[data-quality] 差分検査: ${JSON.stringify(regression.summary)}`);

if (warnings.length) {
  console.log(`\n[data-quality] 警告 ${warnings.length} 件:`);
  for (const w of warnings.slice(0, 150)) console.log(`  ⚠ ${w}`);
  if (warnings.length > 150) console.log(`  …他 ${warnings.length - 150} 件`);
  if (process.env.GITHUB_ACTIONS) console.log(`::warning title=data-quality::品質警告 ${warnings.length} 件（詳細はログ参照）`);
}

// ジョブサマリ（GitHub Actions の実行画面に表で出す）
if (process.env.GITHUB_STEP_SUMMARY) {
  const rr = readJsonOr(REGRESSION_REPORT, null);
  const s = regression ? regression.summary : {};
  const rows = [
    ['前回件数', prevData ? countEvents(prevData) : '—'],
    ['今回件数', total],
    ['地本の急減（エラー / 警告）', regression ? `${s.prefErrors} / ${s.prefWarnings}` : '—'],
    ['項目の消失（エラー / 正当な変更）', regression ? `${s.fieldErrors} / ${s.fieldWarnings}` : '—'],
    ['未終了イベントの消失（原因不明 / 全体）', regression ? `${s.missingUnexplained} / ${s.missingTotal}` : '—'],
    ['スクレイパーが前回値を保護した項目', rr ? rr.summary.fieldsCarriedOver : '—'],
    ['スクレイパーが引き継いだ0件化地本', rr ? rr.summary.prefCountAlerts : '—'],
    ['検疫（公開保留）', (quarantine.events || []).length],
    ['LLM 再検査（要再検査 / 実施）', llm && llm.summary ? `${llm.summary.flagged} / ${llm.summary.attempted}` : '—'],
    ['判定', errors.length ? `❌ エラー ${errors.length} 件` : '✅ 合格'],
  ];
  const md = ['### データ品質・差分検査', '', '| 項目 | 値 |', '|---|---|', ...rows.map(([k, v]) => `| ${k} | ${v} |`), '',
    ...(errors.length ? ['<details><summary>エラー詳細</summary>', '', ...errors.slice(0, 50).map(e => `- ${e}`), '', '</details>', ''] : [])];
  try { appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join('\n') + '\n'); } catch { /* サマリは補助 */ }
}

if (errors.length) {
  console.error(`\n[data-quality] エラー ${errors.length} 件（コミット・デプロイを停止します）:`);
  for (const e of errors.slice(0, 200)) console.error(`  ✖ ${e}`);
  if (process.env.GITHUB_ACTIONS) {
    for (const e of errors.slice(0, 10)) console.error(`::error title=data-quality::${e}`);
    console.error(`::error title=data-quality::品質エラー ${errors.length} 件でデプロイを停止`);
  }
  process.exit(1);
}

console.log('\n[data-quality] OK（エラーなし）');
