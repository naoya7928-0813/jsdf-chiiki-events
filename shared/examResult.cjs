'use strict';
// 採用試験の合格者発表・試験結果の判定（イベントではないので掲載しない）。
// 2026-10 に「令和8年度航空学生採用第1次試験合格者」「採用候補者名簿記載通知者発表」等が
// イベントとして公開・アーカイブされていた（地本サイトのお知らせ欄・合格者PDFを拾っていた）。
// リンク探索・チラシ取得の前（OCR を使わない）と、公開・前回値の持ち越し・アーカイブの前の両方で使う。

// URL のディレクトリ・ファイル名（例: /bosyu/goukaku/…, /saiyou/goukaku_pdf/…）
const RESULT_PATH = /(?:^|[/_.-])(?:goukaku|gokaku|goukakusha|gokakusha|goukakuhappyou|合格者?|合格発表)(?=[/_.\-\d]|$)/i;

// 本文・タイトル（NFKC＋空白除去後）。OCR の読み違い「合拔」「合和…合格」も拾う
const RESULT_TEXT = new RegExp([
  '合[格拔]者(?!説明会|向け|の(?:皆|方))',  // 「合格者説明会」「合格者向け…」は除く（下の救済でも見る）
  '合格(?:発表|通知|番号)',
  '最終合格',
  '次試験(?:の)?合格',
  '採用候補者名簿',
  '名簿記載(?:通知)?者',
  '(?:採用)?試験(?:の)?結果(?:発表|について|のお知らせ)',
  '合否',
  // 採用試験の日程そのもの（「防衛医科大学校学生採用第1次試験」）。試験の説明会・対策講座は下の救済で残す
  '採用(?:第?[0-9一二三]次)?試験(?:日程|会場|の実施|$)',
].join('|'));

// 合格者向けの説明会・激励会など、参加するイベントは残す
const RESCUE = /説明会|ガイダンス|激励|壮行|懇談|見学|体験|入隊式|入校式|入隊予定者|ツアー|相談会|セミナー|対策|講座|模擬/;

const norm = (s) => String(s || '').normalize('NFKC').replace(/\s+/g, '');

/**
 * 合格者発表・試験結果の資料/ページか。
 * @param {{url?: string, text?: string}} src  text はリンク文言・タイトル等
 */
function isExamResultSource({ url = '', text = '' } = {}) {
  const t = norm(text);
  if (t && RESCUE.test(t)) return false;
  let pathname = '';
  try { pathname = new URL(url, 'https://example.invalid/').pathname; } catch { /* text だけで判定 */ }
  try { pathname = decodeURIComponent(pathname); } catch { /* 未デコードのまま */ }
  return RESULT_PATH.test(pathname) || (!!t && RESULT_TEXT.test(t));
}

/** イベント（title/url/imageUrl/notes）が合格者発表・試験結果か。 */
function isExamResultEvent(ev) {
  if (!ev) return false;
  const text = [ev.title].filter(Boolean).join(' ');
  if (RESCUE.test(norm(text))) return false;
  return isExamResultSource({ url: ev.url, text }) || (!!ev.imageUrl && isExamResultSource({ url: ev.imageUrl }));
}

module.exports = { isExamResultSource, isExamResultEvent };
