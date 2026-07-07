/**
 * clean-events-titles.mjs（手動データクリーニング）
 *
 * 既存の public/data/events.json に対して、スクレイパーの writeOutput と同じ
 * titleQuality フルパイプライン（検証済み修正→整形→不正除外→年ズレ除外→重複統合）
 * ＋募集案内所イベントの office 整形を直接適用して上書きする。
 * 次回スクレイプを待たずに、表示・通知・events.json 本体を綺麗にするためのもの。
 *
 *   node scripts/clean-events-titles.mjs        # 適用して上書き
 *   node scripts/clean-events-titles.mjs --dry  # 差分表示のみ
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'public/data/events.json');
const DRY = process.argv.includes('--dry');

const isOffice = ev => typeof ev?.source_type === 'string' && ev.source_type.startsWith('office');
// 整形・非イベント判定は共通モジュールに一本化（writeOutput と同一経路）
import { officeIsJunk, cleanOfficeTitle, cleanOfficePlace, stripTrailingCta } from '../shared/officeTitle.cjs';
import {
  applyVerifiedOverrides, cleanEventTitle, cleanPlaceText, splitPlaceAddress, cleanTimeText, cleanDeadlineText,
  isJunkOrStubTitle, isStaleDatedEvent, dedupEvents,
} from '../shared/titleQuality.cjs';

const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
let dropped = 0, changed = 0, placeChanged = 0, fieldChanged = 0, total = 0, dedupedCount = 0;
const samples = [];
const droppedList = [];

for (const k of Object.keys(data)) {
  if (!Array.isArray(data[k])) continue;
  const next = [];
  for (const raw of data[k]) {
    total++;
    // 1) チラシ照合済みの検証修正 → 2) 全経路共通整形 → 3) office 系は追加整形
    const ev = applyVerifiedOverrides(raw);
    let cleaned = cleanEventTitle(ev.title);
    cleaned = isOffice(ev) ? stripTrailingCta(cleanOfficeTitle(cleaned)) : stripTrailingCta(cleaned);
    // 4) 不正・スタブ・年ズレは除外（office 系は officeIsJunk も併用）
    // office_notice=旧「公式確認」スタブ（偽の開催日を持つ疑似イベント。生成廃止済み）
    const junk = !ev.date || !cleaned
      || ev.source_type === 'office_notice'
      || isJunkOrStubTitle(cleaned)
      || isStaleDatedEvent({ ...ev, title: cleaned })
      || (isOffice(ev) && (officeIsJunk(ev.title) || officeIsJunk(cleaned)
          || cleaned === '募集案内所イベント' || cleaned.replace(/[\s　]/g, '').length < 4));
    if (junk) { dropped++; droppedList.push(`[${k}] ${ev.title}`); continue; }
    const out = { ...ev };
    if (cleaned !== raw.title) {
      if (samples.length < 40) samples.push(`[${k}] ${raw.title}\n      → ${cleaned}`);
      out.title = cleaned;
      changed++;
    }
    // 場所欄の整形（全経路共通 + office 系）＋ 住所分離
    const cpBase = isOffice(ev) ? cleanOfficePlace(cleanPlaceText(ev.place)) : cleanPlaceText(ev.place);
    const { place: cp, address: ca } = splitPlaceAddress(cpBase, ev.address);
    if ((cp || '') !== (ev.place || '')) { out.place = cp; placeChanged++; }
    if ((ca || '') !== (ev.address || '')) { out.address = ca; fieldChanged++; }
    // 時間・締切の書式整形（"null"・時分表記・英語表記など）
    const ct = cleanTimeText(ev.time);
    if ((ct || '') !== (ev.time || '')) { out.time = ct; fieldChanged++; }
    const cd = cleanDeadlineText(ev.deadline) || null;
    if ((cd || null) !== (ev.deadline || null)) { out.deadline = cd; fieldChanged++; }
    next.push(out);
  }
  // 5) 重複統合（同一地本・同日・名称一致/包含・場所両立のみ）
  const merged = dedupEvents(next);
  dedupedCount += next.length - merged.length;
  data[k] = merged;
}

console.log(`総数:${total} 除外:${dropped} タイトル変更:${changed} 場所変更:${placeChanged} 時間/締切変更:${fieldChanged} 重複統合:${dedupedCount}`);
if (droppedList.length) {
  console.log('--- 除外 ---');
  droppedList.forEach(s => console.log('  ' + s));
}
console.log('--- 変更サンプル ---');
samples.forEach(s => console.log('  ' + s));

if (DRY) { console.log('\n--dry のため書き込みません'); }
else {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log('\npublic/data/events.json を更新しました');
}
