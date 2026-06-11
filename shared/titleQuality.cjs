'use strict';

/**
 * イベント名の品質管理モジュール（スクレイパー/チェックスクリプト共通）
 *
 * タイトルは複数経路で生成される（HTMLパーサー直接抽出 / OCR /
 * 事務所巡回 / 前回データ維持）ため、個別経路ではなく
 * 最終出力(writeOutput)とQAスクリプトの両方からこのモジュールを使い、
 * 経路に依存しない防御とする。新種の不正パターンはここに追加すること。
 */

/** 全角英数字を半角に変換する（年判定・重複判定の正規化用） */
function toHalfAlnum(s) {
  return String(s || '').replace(/[０-９Ａ-Ｚａ-ｚ]/g,
    ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
}

/**
 * イベント名の前後に付くゴミを整形する（除外ではなく修復）。
 * 例: 「# 海上自衛隊」「&自衛隊…」「NEW6/14&7/11 自衛隊…」「1オンライン説明会」
 */
function cleanEventTitle(raw) {
  if (!raw) return raw;
  let t = String(raw).replace(/\s+/g, ' ').trim();
  t = t.replace(/^[#＃]+\s*/, '');                 // Markdown見出し残骸
  t = t.replace(/^[★☆●○■□◆◇※]+\s*/, '');     // 装飾記号
  t = t.replace(/^[&＆]+\s*/, '');                 // 連結残骸
  // 「NEW6/14&7/11 」のような新着マーク＋日付断片
  t = t.replace(/^(?:NEW|ＮＥＷ|新着)(?=[\s\d０-９!！/／&＆])[!！]*[\s\d０-９/／&＆.．]*/, '');
  t = t.replace(/^\d\s*(?=[ァ-ヶ])/, '');          // 「1オンライン説明会」等のページ番号残骸
  t = t.replace(/\s*参加費\s*無料[!！]*$/, '');    // 末尾の宣伝文句
  return t.trim();
}

/**
 * イベント名が「中身のない/不正な」ものか判定する。
 * OCR残骸・申し込み案内・住所/電話混入・様式断片・注記文・スタブを検出。
 */
function isJunkOrStubTitle(title) {
  if (!title) return true;
  const t = toHalfAlnum(title.trim());
  if (/↑.*申し込み/.test(t))                  return true; // 「↑申し込みはこちら↑」
  if (/【?お問合せ|お問い合わせ先/.test(t))     return true; // 「【お問合せ先】」
  if (/〒\s*\d/.test(t))                       return true; // 郵便番号（住所混入）
  if (/\d{2,4}[-－]\d{3,4}[-－]\d{4}/.test(t)) return true; // 電話番号
  if (/及び定員|提出書類|応募方法|様式第/.test(t)) return true; // 様式・フォームの項目断片
  if (/入札公告/.test(t))                      return true; // 調達情報（イベントではない）
  if (/チラシを参照|参照願います/.test(t))      return true; // 注記文の混入
  if (/。/.test(t) && t.length >= 30)          return true; // 文章がタイトル化（案内文の混入）
  // 「自衛隊○○地本イベント」「○○地本イベント（場所）」等の中身なしスタブ
  if (/^(?:自衛隊)?.{0,6}地本イベント(?:\s*（[^）]*）)?$/.test(t)) return true;
  // 日本語がほぼ無い断片（例:「1 R.22〜＃2 R.24」）。英語タイトルは許容
  const jp = (t.match(/[぀-ヿ㐀-䶿一-鿿]/g) || []).length;
  if (jp < 3 && !/[A-Za-z]{4,}/.test(t))       return true;
  return false;
}

/**
 * 過去年のイベントが現在年の日付で再登録されたものか判定する。
 * 例: サイトに残る2024年の実績一覧を年なし日付として拾い、
 *     現在年(2026)で補完してしまったケース。
 * - タイトル中の西暦がイベント日付の年より古い → 過去物
 * - URL の日付スタンプ（例: 20241027_xxx.pdf）が古い → 過去物
 */
function isStaleDatedEvent(ev) {
  const evYear = parseInt(String(ev.date || '').slice(0, 4), 10);
  if (!evYear) return false;
  const t = toHalfAlnum(ev.title || '');
  for (const m of t.matchAll(/(?:^|\D)(20\d{2})(?:\D|$)/g)) {
    if (parseInt(m[1], 10) < evYear) return true;
  }
  const um = String(ev.url || '').match(/\/(20\d{2})\d{4}[^/]*\.(?:pdf|jpe?g|png|gif)/i);
  if (um && parseInt(um[1], 10) < evYear) return true;
  return false;
}

/** 重複判定用の正規化（括弧内・空白・記号を除去） */
function normForDedup(s) {
  let t = toHalfAlnum(s);
  t = t.replace(/[（(][^）)]*[）)]/g, '');
  t = t.replace(/[\s　・|｜/／&＆!！?？.。、,，:：~〜～\-－]/g, '');
  return t;
}

/**
 * 同一地本内の重複イベントを統合する。
 * 同一日付で、名称が一致（または一方が他方を含む）し、場所が両立する
 * （どちらか空・一致・包含）場合のみ重複とみなす。
 * ※ 同名でも場所が異なるイベント（例: 同日の説明会を複数事務所で開催）は残す。
 * 重複時は情報量の多い方（場所・時間・備考あり）を残す。
 */
function dedupEvents(list) {
  const kept = [];
  const score = e => String(e.title || '').length
    + (e.place ? 5 : 0) + (e.time ? 3 : 0) + (e.notes ? 1 : 0);
  for (const ev of list) {
    const n = normForDedup(ev.title || '');
    let merged = false;
    for (let i = 0; i < kept.length; i++) {
      const k = kept[i];
      if (k.ev.date !== ev.date) continue;
      const sameTitle = k.n === n && n.length > 0;
      const contained = !sameTitle && k.n.length >= 10 && n.length >= 10
        && (k.n.includes(n) || n.includes(k.n));
      if (!sameTitle && !contained) continue;
      const pk = normForDedup(k.ev.place || '');
      const pe = normForDedup(ev.place || '');
      // 場所が両方あり、かつ別物なら別イベント
      if (pk && pe && pk !== pe && !pk.includes(pe) && !pe.includes(pk)) continue;
      if (score(ev) > score(k.ev)) kept[i] = { ev, n };
      merged = true;
      break;
    }
    if (!merged) kept.push({ ev, n });
  }
  return kept.map(k => k.ev);
}

module.exports = {
  cleanEventTitle,
  isJunkOrStubTitle,
  isStaleDatedEvent,
  dedupEvents,
  normForDedup,
  toHalfAlnum,
};
