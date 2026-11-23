'use strict';
/**
 * イベント一覧のキーワード検索（2026-11-23 導入）。画面（ListScreen）とテストで共有する。
 *
 * - 全角／半角（ＦＣ＝FC）、大文字／小文字、ひらがな／カタカナ（こうくうさい＝コウクウサイ）を同じものとして比べる
 * - 空白で区切った語はすべて含むものだけ（AND）。例「航空祭 12月」
 * - 探す項目: イベント名・会場・住所・種目・申込・対象・備考・掲載元の地本名（「宮崎」で宮崎地本のイベント）・
 *   開催日（「12月6日」「12月」）
 * - 検索語は正規表現にしない（記号をそのまま文字として扱う＝想定外の重い処理や誤動作を起こさない）
 * - 長すぎる入力は先頭だけ使う（MAX_QUERY_LENGTH）
 */

const MAX_QUERY_LENGTH = 60;

/** 比べるための形にそろえる（NFKC・小文字・カタカナ→ひらがな・空白除去） */
function normalizeForSearch(s) {
  return String(s == null ? '' : s)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/[\s　]+/g, '');
}

/** 検索語を語ごとに分ける（空白区切り。正規化済み・空は除く） */
function parseQuery(query) {
  return String(query == null ? '' : query)
    .slice(0, MAX_QUERY_LENGTH)
    .normalize('NFKC')
    .split(/[\s　]+/)
    .map(normalizeForSearch)
    .filter(Boolean);
}

/** イベントの検索対象の文字列（正規化済み） */
function searchableText(ev, prefLabel = '') {
  if (!ev) return '';
  const label = prefLabel ? `${prefLabel} ${prefLabel}地本` : '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ev.date || ''));
  const day = m ? `${Number(m[2])}月${Number(m[3])}日` : '';
  // 項目ごとに正規化して区切り文字でつなぐ（項目の境目をまたいで当たらないように）
  return [ev.title, ev.place, ev.address, ev.category, ev.tag, ev.ageRequirement, ev.notes, label, day]
    .filter(v => typeof v === 'string' && v)
    .map(normalizeForSearch)
    .join('\u0001');
}

/**
 * 検索語に当てはまるか。terms は parseQuery の結果（空なら常に true）。
 * @param {object} ev
 * @param {string[]} terms
 * @param {string} [prefLabel] 掲載元の地本名（例「宮崎」）
 */
function matchesSearch(ev, terms, prefLabel = '') {
  if (!terms || !terms.length) return true;
  const text = searchableText(ev, prefLabel);
  return terms.every(t => text.includes(t));
}

module.exports = { MAX_QUERY_LENGTH, normalizeForSearch, parseQuery, searchableText, matchesSearch };
