// パーサーの「成功」の判定（純粋）。HTTP 200 で 0 件を返しただけでは成功とみなさない。
//
// 2026-09-23 山梨: 公式ページの構造が変わり（.event_block → .uketsuke の表）、パーサーは毎回 0 件を返していた。
// ページには今後の日付が並んでいるのに「0件＝正常」として扱われ、前回データも引き継がれなかった。
// → 本文に今日以降の日付が複数あるのに 0 件なら「パーサー失敗」として扱い、前回データを維持させる。
'use strict';

const toHalf = (s) => String(s || '').replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

/**
 * 本文中の「今日以降の日付」の数を数える。
 * 対応: 令和N年M月D日 / YYYY年M月D日 / YYYY/M/D / M月D日（年は今日から見て最も近い未来で補う）
 * @param {string} text ページ本文（コメント・script を除いたテキスト）
 * @param {string} today YYYY-MM-DD
 */
function countFutureDateMarkers(text, today) {
  const t = toHalf(text);
  const [ty] = String(today).split('-').map(Number);
  const seen = new Set();
  const add = (y, m, d) => {
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return;
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (iso >= today) seen.add(iso);
  };
  const consumed = [];
  for (const m of t.matchAll(/令和\s*(元|\d{1,2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/g)) {
    add(2018 + (m[1] === '元' ? 1 : Number(m[1])), Number(m[2]), Number(m[3]));
    consumed.push([m.index, m.index + m[0].length]);
  }
  for (const m of t.matchAll(/(20\d{2})\s*[年/.]\s*(\d{1,2})\s*[月/.]\s*(\d{1,2})/g)) {
    add(Number(m[1]), Number(m[2]), Number(m[3]));
    consumed.push([m.index, m.index + m[0].length]);
  }
  const inConsumed = (i) => consumed.some(([a, b]) => i >= a && i < b);
  for (const m of t.matchAll(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/g)) {
    if (inConsumed(m.index)) continue;
    const mo = Number(m[1]), d = Number(m[2]);
    // 年の無い日付: 今年の日付が半年以上前なら来年とみなす（年末に翌年1月の予定が並ぶため）。
    // 数日〜数か月前の日付は「過去の実績」なので数えない。
    const thisYear = `${ty}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (thisYear >= today) add(ty, mo, d);
    else if ((Date.parse(today) - Date.parse(thisYear)) / 86400000 > 180) add(ty + 1, mo, d);
  }
  return seen.size;
}

/**
 * パース結果の健全性。0件なのに本文に今日以降の日付が MIN_MARKERS 個以上あればパーサー失敗の疑い。
 * @returns {{ ok:boolean, futureDateMarkers:number, parsedEvents:number, reason?:string }}
 */
const MIN_MARKERS = 2;
function assessParseResult({ text, eventCount, today }) {
  const markers = countFutureDateMarkers(text, today);
  const parsed = Number(eventCount) || 0;
  if (parsed === 0 && markers >= MIN_MARKERS) {
    return { ok: false, futureDateMarkers: markers, parsedEvents: parsed,
      reason: `本文に今日以降の日付が ${markers} 件あるのに 0 件しか取得できませんでした（ページ構造の変更の疑い）` };
  }
  return { ok: true, futureDateMarkers: markers, parsedEvents: parsed };
}

module.exports = { countFutureDateMarkers, assessParseResult, MIN_MARKERS };
