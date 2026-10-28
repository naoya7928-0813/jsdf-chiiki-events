#!/usr/bin/env node
/**
 * audit-deps — 依存パッケージの脆弱性監査（サイト本体＋スクレイパー）
 *
 *   node scripts/audit-deps.mjs            # 監査して結果を表示（未対応があれば exit 1）
 *   node scripts/audit-deps.mjs --json     # 結果を JSON で出す（他のツールへ渡す用）
 *
 * `npm audit --json` を root と scraper で実行し（lockfile だけを見るので npm ci は不要）、
 * security/audit-allowlist.json の「確認して受け入れた指摘」と突き合わせる。判定は shared/depAudit.cjs。
 *   - 一覧に無い指摘・期限切れ・一覧の書き方の誤り … 失敗（exit 1）
 *   - npm audit 自体が動かない（通信不可など）     … 失敗（exit 2。確かめられないものを合格にしない）
 * GitHub Actions では実行サマリ（GITHUB_STEP_SUMMARY）に表を出す。
 * 開発用の依存も含めて調べる（ビルドは VERCEL_TOKEN 等のシークレットがある CI で動くため）。
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const A = require('../shared/depAudit.cjs');
const execFileAsync = promisify(execFile);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROJECTS = [
  { name: 'root', dir: ROOT },
  { name: 'scraper', dir: path.join(ROOT, 'scraper') },
];
const ALLOWLIST_PATH = path.join(ROOT, 'security', 'audit-allowlist.json');
const asJson = process.argv.includes('--json');

/** JST の今日（YYYY-MM-DD） */
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

async function npmAudit(dir) {
  try {
    const { stdout } = await execFileAsync('npm', ['audit', '--json'], { cwd: dir, maxBuffer: 64 * 1024 * 1024 });
    return JSON.parse(stdout);
  } catch (err) {
    // 指摘があると npm audit は exit 1 を返すが、stdout には結果の JSON が入っている
    if (err && err.stdout) {
      try { return JSON.parse(err.stdout); } catch { /* 下で失敗扱い */ }
    }
    throw new Error(`npm audit を実行できません（${dir}）: ${String(err && err.message || err).slice(0, 300)}`);
  }
}

let findings = [];
try {
  for (const p of PROJECTS) {
    const json = await npmAudit(p.dir);
    if (json.error) throw new Error(`npm audit がエラーを返しました（${p.name}）: ${JSON.stringify(json.error).slice(0, 300)}`);
    findings = findings.concat(A.collectFindings(json, p.name));
  }
} catch (err) {
  console.log(`::error::${err.message}`);
  process.exit(2);
}

const allowlist = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8'));
const result = A.evaluate(findings, allowlist, today);

if (asJson) {
  console.log(JSON.stringify({ today, ...result }, null, 2));
} else {
  console.log(A.formatMarkdown(result, { today }));
}
for (const f of result.blocking) console.log(`::error::未対応の脆弱性: [${f.project}] ${f.package} ${f.id}（${f.severity}）${f.title}`);
for (const f of result.expired) console.log(`::error::受け入れ期限切れ（${f.entry.expires}）: [${f.project}] ${f.package} ${f.id}。見直して security/audit-allowlist.json を更新してください`);
for (const e of result.unused) console.log(`::warning::今は指摘されていないため一覧から消せます: ${e.id} / ${e.package}`);
for (const e of result.errors) console.log(`::error::security/audit-allowlist.json: ${e}`);

if (process.env.GITHUB_STEP_SUMMARY) {
  try { appendFileSync(process.env.GITHUB_STEP_SUMMARY, A.formatMarkdown(result, { today }) + '\n'); } catch { /* サマリは任意 */ }
}
process.exit(result.ok ? 0 : 1);
