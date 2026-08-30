/**
 * tags — イベントのタグ（申込要否・属性）の唯一の出どころ
 *
 * 同じ判定をスクレイパー（付与）とフロント（絞り込み）が別々に持っていたため、
 * 片方だけ語を足すとズレる状態だった（実際、スクレイパーだけが付ける「個別」に
 * 対応する絞り込みチップが無く、付いていても絞り込めなかった）。
 *
 * ここを直したら両方に効く:
 *   - scraper/parsers/utils.js の guessTags()（タイトル・備考からの推定）
 *   - src/components/FilterBar.jsx の絞り込みチップと件数
 */
'use strict';

/**
 * タグ定義。順序はスクレイパーが付ける優先順（guessTag は先頭を採用）と、
 * 絞り込みチップの並び順を兼ねる。
 * rx … タイトル・備考から推定するための正規表現
 */
const TAG_DEFS = Object.freeze([
  { id: '入場無料',  label: '入場無料',  rx: /無料|入場無料/ },
  { id: '要予約',    label: '要予約',    rx: /予約|申込|申し込み|事前|事前登録/ },
  { id: 'オンライン', label: 'オンライン', rx: /オンライン|Zoom|zoom|ウェブ/ },
  { id: '家族向け',  label: '家族向け',  rx: /家族|子ども|お子|ファミリー|親子/ },
  { id: '学生向け',  label: '学生向け',  rx: /高校生|中学生|学生|大学生|学校/ },
  { id: '抽選',      label: '抽選',      rx: /抽選/ },
  { id: '個別',      label: '個別',      rx: /個別/ },
  { id: 'OB・OG',   label: 'OB・OG',   rx: /OB|OG|元自衛官/ },
]);

/** タグID一覧 */
const TAG_VALUES = Object.freeze(TAG_DEFS.map(d => d.id));

/**
 * タイトル・備考などからタグを推定する（複数マッチ）。
 * text は title + notes 等を結合して渡すこと。
 */
function guessTags(text) {
  const s = String(text || '');
  return TAG_DEFS.filter(d => d.rx.test(s)).map(d => d.id);
}

/** 後方互換：先頭タグのみ返す（既存パーサーが tag: guessTag(...) で呼ぶ） */
function guessTag(text) {
  return guessTags(text)[0] ?? '';
}

/**
 * イベントがタグに該当するか（絞り込み用）。
 * 保存済みの ev.tag だけでなく、タイトル・備考も見る（スクレイプは主タグ1つしか持たないため）。
 * 未知のタグIDは ev.tag の完全一致で判定する。
 */
function matchesTag(ev, tagId) {
  const def = TAG_DEFS.find(d => d.id === tagId);
  if (!def) return ev?.tag === tagId;
  const haystack = [ev?.title, ev?.notes, ev?.tag].filter(Boolean).join(' ');
  return def.rx.test(haystack);
}

module.exports = { TAG_DEFS, TAG_VALUES, guessTags, guessTag, matchesTag };
