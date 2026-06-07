/**
 * clean-events-titles.mjs（手動データクリーニング・一回限り）
 *
 * 既存の public/data/events.json に対して、フロント(useEvents)/スクレイパーと同じ
 * タイトル整形・非イベント除外を直接適用して上書きする。
 * 次回スクレイプを待たずに、表示・通知・events.json 本体を綺麗にするためのもの。
 *
 *   node scripts/clean-events-titles.mjs        # 適用して上書き
 *   node scripts/clean-events-titles.mjs --dry  # 集計のみ
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'public/data/events.json');
const DRY = process.argv.includes('--dry');

const isOffice = ev => typeof ev?.source_type === 'string' && ev.source_type.startsWith('office');
// 整形・非イベント判定は共通モジュールに一本化
import { officeIsJunk, cleanOfficeTitle, stripTrailingCta } from '../shared/officeTitle.cjs';

const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
let dropped = 0, changed = 0, total = 0;
const samples = [];

for (const k of Object.keys(data)) {
  if (!Array.isArray(data[k])) continue;
  const next = [];
  for (const ev of data[k]) {
    total++;
    if (isOffice(ev) && officeIsJunk(ev.title)) { dropped++; continue; }
    const cleaned = isOffice(ev) ? stripTrailingCta(cleanOfficeTitle(ev.title)) : stripTrailingCta(ev.title);
    // 整形しても中身が残らない（救済不能）募集案内所イベントは除外
    if (isOffice(ev) && (cleaned === '募集案内所イベント' || cleaned.replace(/[\s　]/g, '').length < 4)) { dropped++; continue; }
    if (cleaned !== ev.title) {
      if (samples.length < 25) samples.push(`[${k}] ${ev.title}\n      → ${cleaned}`);
      ev.title = cleaned;
      changed++;
    }
    next.push(ev);
  }
  data[k] = next;
}

console.log(`総数:${total} 除外:${dropped} タイトル変更:${changed}`);
console.log('--- 変更サンプル ---');
samples.forEach(s => console.log('  ' + s));

if (DRY) { console.log('\n--dry のため書き込みません'); }
else {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log('\npublic/data/events.json を更新しました');
}
