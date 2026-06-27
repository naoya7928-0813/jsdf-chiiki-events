/**
 * 年ズレ（過去年が現在年の日付で再登録された）イベントを events.json から除去する。
 * - 共通防御 shared/titleQuality.cjs の isStaleDatedEvent（西暦＋和暦＋URLスタンプ）で判定
 * - OCR本文にのみ年があり title/URL に年が残らないケース（例: 江の島「掃海艇はつしま」=
 *   令和元年）は判定できないため、確定済みの個別除外も併用する
 * 実行: node scripts/clean-stale-events.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { isStaleDatedEvent } = require('../shared/titleQuality.cjs');

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = join(__dirname, '../public/data/events.json');

// 一次ソース照合で確定した個別除外（title/URLに年が無く自動判定できないもの）
const MANUAL_DROP = [
  // 江の島「掃海艇はつしま」一般公開: チラシ「守りたいむす」に令和元年12/21(土)・22(日)と明記
  (e) => /mamotai1-12\.pdf/.test(e.url || '') && /掃海艇はつしま/.test(e.title || ''),
];

const data = JSON.parse(readFileSync(FILE, 'utf8'));
const removed = [];
let total = 0, kept = 0;

for (const [pref, evs] of Object.entries(data)) {
  if (!Array.isArray(evs)) continue;
  const next = [];
  for (const e of evs) {
    total++;
    const stale = isStaleDatedEvent(e);
    const manual = MANUAL_DROP.some((f) => f(e));
    if (stale || manual) {
      removed.push({ pref, date: e.date, title: e.title, reason: stale ? 'isStaleDatedEvent(和暦/西暦)' : 'manual(一次ソース照合)', url: e.url });
    } else {
      next.push(e); kept++;
    }
  }
  data[pref] = next;
}

console.log(`総数 ${total} → 残 ${kept} / 除去 ${removed.length}`);
for (const r of removed) console.log(`  - [${r.reason}] ${r.pref} ${r.date} ${r.title}  <= ${r.url || ''}`);

if (removed.length > 0) {
  writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log('\nevents.json を更新しました。');
} else {
  console.log('\n除去対象なし。変更なし。');
}
