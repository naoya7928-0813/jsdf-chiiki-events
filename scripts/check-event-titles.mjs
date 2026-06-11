#!/usr/bin/env node
/**
 * イベント名の品質チェック（スクレイプ後のQA用）
 *
 * public/data/events.json の全イベント名を走査し、
 * 表記ゆれ・記載エラーの疑いがあるものを一覧表示する。
 *
 * 使い方:
 *   node scripts/check-event-titles.mjs        # 疑わしい項目を表示
 *   （疑い項目が1件以上あれば exit 1。CIでは警告通知に使う）
 *
 * ここで検出するのは「自動除外まではしないが人の目で確認すべき」もの。
 * 明確な不正（住所・案内文・スタブ・年ズレ・重複）は
 * shared/titleQuality.cjs により writeOutput 時点で自動除外/統合される。
 * 新種の不正パターンを見つけたら titleQuality.cjs に追加すること。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { isJunkOrStubTitle, isStaleDatedEvent, toHalfAlnum } =
  require('../shared/titleQuality.cjs');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(join(root, 'public/data/events.json'), 'utf8'));

// 「疑わしい」パターン（自動除外はしないが目視確認の対象）
const CHECKS = [
  ['junk素通り',   (t, ev) => isJunkOrStubTitle(t)],                    // フィルタ漏れ（本来ゼロのはず）
  ['年ズレ素通り', (t, ev) => isStaleDatedEvent(ev)],                   // 同上
  ['住所混入疑い', t => /[一-龥]{2,3}[都道府県].{1,12}[市区郡].{0,15}(丁目|番地|ビル|階)/.test(t)],
  ['案内文疑い',   t => /申し込み|申込はこちら|詳しくは|詳細は(?:こちら)?$|クリック/.test(t)],
  ['記号残骸',     t => /^[#＃■●◆※→↑↓・/／、。&＆]|[／/&＆]\s*$/.test(t)],
  ['文字化け',     t => /[队乐贝实团济纪记书译录习场]|�/.test(t)],
  ['時刻混入',     t => /\d{1,2}[:：]\d{2}\s*[~～〜-]/.test(toHalfAlnum(t))],
  ['カレンダー塊', t => (t.match(/[（(][月火水木金土日][）)]/g) || []).length >= 3],
  ['極端に短い',   t => t.replace(/[\s　]/g, '').length <= 3],
  ['極端に長い',   t => t.length >= 45],
  // 部隊・組織名だけでイベント種別（見学・説明会等）が無いタイトル
  // （例: OCRがチラシ最上部の部隊名だけを拾った「海上自衛隊」「自衛隊仙台病院」）
  ['部隊名のみ疑い', t => /^(?:陸上|海上|航空)?自衛隊(?:[一-鿿ァ-ヶ]{2,6}(?:病院|救難隊|音楽隊|基地|部隊))?$/.test(t.trim())],
  // 場所欄に巡回元の事務所リストが残っている疑い
  ['場所=事務所リスト疑い', (t, ev) => /ほか\d+拠点/.test(ev.place || '')],
];

let flagged = 0;
let total = 0;
for (const pref of Object.keys(data)) {
  if (!Array.isArray(data[pref])) continue;
  for (const ev of data[pref]) {
    total++;
    const hits = CHECKS.filter(([, fn]) => fn(ev.title || '', ev)).map(([name]) => name);
    if (hits.length) {
      flagged++;
      console.log(`[${pref}] (${hits.join(',')})`);
      console.log(`   "${ev.title}"  date=${ev.date} src=${ev.source_type || '-'}`);
    }
  }
}

console.log('');
if (flagged) {
  console.log(`要確認: ${flagged} 件 / 全 ${total} 件`);
  process.exit(1);
} else {
  console.log(`イベント名チェック OK（全 ${total} 件）`);
}
