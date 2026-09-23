// バックアップファイルの検証（件数・schemaVersion・checksum・作成日時・秘密項目の不在）。
//   node scripts/verify-backup.mjs jsdf-backup-YYYYMMDD-HHmm.json
// 合格なら exit 0、不合格なら理由を表示して exit 1。判定は shared/backupFormat.cjs の verifyBackup。
// 本番の移行・デプロイ前に取得したバックアップは、必ずこれで確認してから作業を進める（docs/RELEASE_RUNBOOK.md）。
import { readFileSync } from 'node:fs';
import B from '../shared/backupFormat.cjs';

const file = process.argv[2];
if (!file) {
  console.error('使い方: node scripts/verify-backup.mjs <バックアップファイル>');
  process.exit(2);
}

let bundle;
try { bundle = JSON.parse(readFileSync(file, 'utf8')); }
catch (e) { console.error(`[verify-backup] 読み込めません: ${e.message}`); process.exit(1); }

const r = B.verifyBackup(bundle);
const m = bundle.manifest || {};
console.log(`[verify-backup] ${file}`);
console.log(`  形式           : ${m.format} v${m.formatVersion}`);
console.log(`  schemaVersion  : ${m.schemaVersion}（このアプリ ${B.SCHEMA_VERSION}）`);
console.log(`  作成日時       : ${m.createdAt}（作成者 ${m.createdBy || '-'}・環境 ${m.sourceEnvironment || '-'}・アプリ ${m.appVersion || '-'}）`);
console.log(`  コミット       : ${(m.source && m.source.gitCommit) || '-'}`);
for (const [name, count] of Object.entries(r.counts || {})) {
  const meta = (m.sections || {})[name] || {};
  const sum = name === 'audit' ? `${(meta.pages || []).length} ページ` : String(meta.sha256 || '').slice(0, 16);
  console.log(`  ${name.padEnd(14)} : ${String(count).padStart(6)} 件  ${sum}`);
}
if (!r.ok) {
  console.error(`\n[verify-backup] 不合格（${r.errors.length} 件）:`);
  for (const e of r.errors) console.error(`  ✖ ${e}`);
  process.exit(1);
}
console.log('\n[verify-backup] 合格（件数・checksum・schemaVersion・秘密項目なし）');
