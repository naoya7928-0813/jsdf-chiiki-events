'use strict';

/**
 * dedup.js — 重複イベント候補の検出
 *
 * 自動削除はせず duplicate_candidate: true と duplicate_of: id を付けるだけ。
 * 同じ日付・類似タイトル・類似会場を持つイベントを重複候補とする。
 */

/**
 * イベント配列を走査し、重複候補に duplicate_candidate フラグを付けて返す。
 * @param {Array<Object>} events
 * @returns {Array<Object>}
 */
function markDuplicates(events) {
  if (!events || events.length < 2) return events;
  const results = events.map(e => ({ ...e }));

  for (let i = 0; i < results.length; i++) {
    if (results[i].duplicate_candidate) continue;
    for (let j = i + 1; j < results.length; j++) {
      if (results[j].duplicate_candidate) continue;
      if (isSimilar(results[i], results[j])) {
        results[j].duplicate_candidate = true;
        results[j].duplicate_of        = results[i].id;
      }
    }
  }
  return results;
}

function isSimilar(a, b) {
  if (a.date !== b.date)                         return false;
  if (!similarText(a.place,  b.place,  0.8))     return false;
  if (!similarText(a.title,  b.title,  0.7))     return false;
  return true;
}

/**
 * 2テキストの類似度を計算（正規化後の包含関係で判定）
 * @param {string} s1
 * @param {string} s2
 * @param {number} threshold - 一致率の閾値（使用しないが将来的な拡張用）
 */
function similarText(s1, s2, _threshold) {
  if (!s1 && !s2) return true;
  if (!s1 || !s2) return false;
  const n1 = norm(s1), n2 = norm(s2);
  if (n1 === n2) return true;
  const shorter = n1.length < n2.length ? n1 : n2;
  const longer  = n1.length < n2.length ? n2 : n1;
  // 短い方が長い方に含まれ、かつ短い方が十分な長さ（3字以上）
  return shorter.length >= 3 && longer.includes(shorter);
}

function norm(s) {
  return s
    .replace(/\s+/g, '')
    .replace(/[ぁ-ん]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .toLowerCase();
}

module.exports = { markDuplicates };
