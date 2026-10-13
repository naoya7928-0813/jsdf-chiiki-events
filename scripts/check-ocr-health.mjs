#!/usr/bin/env node
/**
 * check-ocr-health — OCR 層の稼働状況を実行サマリへ出し、止まっている経路を警告する
 *
 * 入力: scraper/ocr-stats.json（スクレイパーが毎回書き出す）
 * 出力: 標準出力に経路ごとの状況、問題があれば `::warning::`。
 *       GITHUB_STEP_SUMMARY があれば表を追記し、GITHUB_ENV に OCR_HEALTH を書く。
 * ジョブは落とさない（判定の考え方は shared/ocrHealth.cjs を参照）。
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { evaluateOcrHealth } = require('../shared/ocrHealth.cjs');

const path = process.argv[2] || 'scraper/ocr-stats.json';
let stats = null;
try { stats = JSON.parse(fs.readFileSync(path, 'utf8')); } catch { /* 無ければ評価側が警告する */ }

const { level, problems, lines } = evaluateOcrHealth(stats);
for (const l of lines) console.log(`[OCR稼働] ${l}`);
for (const p of problems) console.log(`::warning::OCR: ${p}`);

const headline = level === 'ok' ? '異常なし' : `要確認 ${problems.length} 件`;
if (process.env.GITHUB_ENV) fs.appendFileSync(process.env.GITHUB_ENV, `OCR_HEALTH=${headline}\n`);
if (process.env.GITHUB_STEP_SUMMARY) {
  const md = ['### OCR 稼働状況', '', ...lines.map(l => `- ${l}`)];
  if (problems.length) md.push('', '**要確認**', ...problems.map(p => `- ⚠️ ${p}`));
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join('\n') + '\n\n');
}
