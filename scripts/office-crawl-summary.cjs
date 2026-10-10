'use strict';
const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, '../scraper/office-crawl-report.json');
const audit = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/office-audit-20261004.json'), 'utf8'));
const lines = ['## 募集窓口のHTML・OCR巡回', '',
  `全国窓口情報の照合: 担当区域等の確認保留 ${audit.pending.length}件、未確定項目あり ${audit.remainingFieldGaps.length}件（重複あり）。担当範囲が不明な窓口は「要確認」と表示し、巡回対象に含めています。監査記録 ${audit.checkedAt}。巡回成功は項目照合の完了を意味しません。`, ''];
if (!fs.existsSync(file)) lines.push('巡回レポート未生成。取得済み・イベントなしとは判断できません。');
else {
  const report = JSON.parse(fs.readFileSync(file, 'utf8'));
  const rows = report.pages || [];
  const count = status => rows.filter(p => p.status === status).length;
  lines.push(`HTML取得 ${count('fetched')} URL / 取得失敗 ${count('fetch_failed')} URL / 未巡回 ${count('not_visited')} URL。`, '',
    'OCRの read はキャッシュ再利用を含む読取結果あり、no_result は資料取得・OCRの処理結果なしです。抽出0件はイベント不在の証明ではありません。', '');
  if (report.error) lines.push(`巡回エラー: ${report.error}`, '');
  const incomplete = rows.filter(p => p.status !== 'fetched' || p.ocr?.status === 'engine_unavailable' || p.ocr?.status === 'not_attempted' || p.ocr?.results?.some(a => a.status === 'no_result') || p.ocr?.deferred > 0);
  lines.push('| 地本・窓口 | HTML | OCR・見送り理由 |', '|---|---|---|');
  const escape = value => String(value || '').replaceAll('|', '/').replace(/[\r\n]/g, ' ');
  for (const p of incomplete) lines.push(`| ${escape(p.pref)} ${escape((p.officeNames || []).join('・') || p.url)} | ${escape(p.status)} | ${escape(p.reason || p.ocr?.reason || p.ocr?.status)}${p.ocr?.deferred ? ` / 未処理候補 ${p.ocr.deferred}` : ''} |`);
  lines.push('', '全URL・窓口ID・資料別の結果は office-crawl-report artifact を参照。');
}
const text = lines.join('\n') + '\n';
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
console.log(text);
