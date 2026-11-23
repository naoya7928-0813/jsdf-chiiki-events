/**
 * 主要イベント（航空祭など）の掲載漏れを調べる（shared/majorEvents.cjs）。
 * 実行: node scripts/check-major-events.mjs [--json]
 *
 * ジョブは落とさない（漏れは地本サイトに載っていないだけで、データの破損ではない）。
 * 例年の時期なのに本体が未掲載のものを `::warning::` と実行サマリに出す。
 * 公式ページで日程を確かめてから運営画面で手動登録すること（推測で登録しない）。
 */
import { readFileSync, appendFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { checkMajorEvents, missingInSeason } from '../shared/majorEvents.cjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(__dirname, '../public/data/events.json'), 'utf8'));
const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

// 運営側の過去イベント（公開しない）。開催済みを漏れと誤認しないために使う
let archive = [];
try { archive = JSON.parse(readFileSync(join(__dirname, '../data/events-archive.json'), 'utf8')).events || []; } catch { archive = []; }
const results = checkMajorEvents(data, today, { archive });
const missing = missingInSeason(results);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ today, results, missing: missing.map(m => m.id) }, null, 2));
} else {
  const label = { listed: '掲載あり', held: '今年は開催済み', related_only: '関連（ツアー等）のみ', missing: '未掲載' };
  for (const r of results) {
    console.log(`${r.inSeason ? '[時期]' : '      '} ${r.name}: ${label[r.status]}${r.matches.length ? `（${r.matches.map(m => `${m.date} ${m.title}`).join(' / ')}）` : ''}`);
  }
}
for (const m of missing) {
  console.log(`::warning title=主要イベントの掲載漏れの可能性::${m.name} が例年の時期ですが${m.status === 'related_only' ? '関連（ツアー等）しか' : ''}掲載されていません。公式ページで日程を確認し、必要なら運営画面で登録してください`);
}

// 管理者通知用（scrape.yml が読む。毎回全置換）
writeFileSync(join(__dirname, '../scraper/major-events-report.json'),
  JSON.stringify({ today, missing: missing.map(m => ({ id: m.id, name: m.name, status: m.status })) }, null, 2));

if (process.env.GITHUB_STEP_SUMMARY) {
  const rows = results.filter(r => r.inSeason).map(r =>
    `| ${r.name} | ${r.status === 'listed' ? '✅ 掲載あり' : r.status === 'held' ? '✅ 開催済み' : r.status === 'related_only' ? '⚠️ 関連のみ' : '⚠️ 未掲載'} | ${r.matches.map(m => `${m.date} ${m.title}`).join('<br>') || '—'} |`);
  if (rows.length) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `\n### 主要イベントの掲載状況（例年の時期のもの）\n\n| イベント | 状況 | 掲載中の項目 |\n|---|---|---|\n${rows.join('\n')}\n\n` +
      '※ 時期は例年の目安。未掲載は地本サイトに載っていないだけの可能性があります。公式ページで確認してから登録してください。\n');
  }
}
