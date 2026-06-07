'use strict';
/**
 * 募集案内所イベントのタイトル整形・非イベント判定（共通モジュール）。
 *
 * スクレイパー(CommonJS)・整形スクリプト(ESM)・フロント(Vite/ESM)の3か所で
 * 同じ実装を使うための唯一の正本。CommonJS で書き、ESM からは
 *   import { cleanOfficeTitle, officeIsJunk, stripTrailingCta } from '.../officeTitle.js'
 * のように名前付きでも読み込める（Node / Vite の CJS 相互運用に対応）。
 *
 * 仕様の要点:
 *  - cleanOfficeTitle: 余計な文章（表ヘッダー・時間/場所・注記・日付・誘導文）を除去。
 *    救済不能な場合は空文字を返す（呼び出し側で除外する）。
 *  - officeIsJunk: 整形しても綺麗にならない塊（過去報告・住所・電話・カレンダー等）を判定。
 *  - stripTrailingCta: 全イベント共通で末尾の「詳細はこちら」等を除去。
 */

// 過去の実施報告・採用制度の説明文・お知らせ/合格発表など「イベントではない」もの
const OFFICE_NONEVENT_RE = /しました|されました|制度です|養成する|養成課程|修業期間|受付期間|応募資格|教育訓練|合格発表|合格者|VIEW\s*ALL|を養成|の紹介/;

// ナビメニュー/カテゴリ一覧の見出し語が複数回出る塊は実イベントではない
function navMenuHits(s) {
  return (String(s || '').match(/イベント情報|採用試験情報|入札情報|重要なお知らせ|トピックス|お知らせ一覧|すべて/g) || []).length;
}

// カレンダー表の塊判定（曜日漢字が空白/数字の前に複数並ぶ）
function weekdayCount(s) {
  return (String(s || '').match(/[日月火水木金土](?=[\s0-9０-９])/g) || []).length;
}

/** 募集案内所イベントとして表示すべきでない（整形しても綺麗にならない）塊か判定 */
function officeIsJunk(title) {
  const t = String(title || '');
  if (OFFICE_NONEVENT_RE.test(t)) return true;
  if (navMenuHits(t) >= 2) return true;
  if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(t)) return true;     // メールアドレス混入
  if (/毎日実施|随時実施/.test(t)) return true;                                  // 常時開催の案内
  if (/Event\s*&\s*Seminar|各種説明会|＆各種/i.test(t)) return true;             // 複数イベントの見出し塊
  if (/[一-龥]{2,3}[都道府県][一-龥]{1,10}[市区郡].{0,18}(丁目|番地|ビル|庁舎|[0-9０-９]+階|第[0-9０-９]+)/.test(t)) return true; // 住所塊
  if (/0[0-9０-９]{1,4}[-－—][0-9０-９]{1,4}[-－—][0-9０-９]{3,4}/.test(t)) return true; // 電話番号混入
  if (weekdayCount(t) >= 4) return true;                                          // カレンダー表の塊
  if (/時期及び定員|及び定員|提出書類|応募方法|別記|様式第/.test(t)) return true;  // フォーム/様式の項目
  if (/[队乐贝实团济纪记书译录习场]|�/.test(t)) return true;                    // OCR文字化け（簡体字・置換文字）
  return false;
}

/**
 * 募集案内所イベントのタイトルから表ヘッダー・時間/場所・注記などの余計な文章を除去する。
 * @param {string} raw  生のタイトル
 * @param {{maxLen?: number}} [opts]  maxLen: 最大文字数（既定60。0/Infinityで無制限）
 * @returns {string}  整形済みタイトル（救済不能なら空文字）
 */
function cleanOfficeTitle(raw, opts) {
  if (!raw) return '';
  const maxLen = opts && Number.isFinite(opts.maxLen) ? opts.maxLen : 60;
  let t = String(raw).replace(/\s+/g, ' ').trim();
  // 先頭のラベル（お知らせ/new/重要 等。連続も除去）
  t = t.replace(/^(?:(?:お知らせ|重要(?:なお知らせ)?|新着|トピックス|new|NEW)\s*)+/gi, '');
  // 『…』で囲まれた正式名称があればそれを優先
  const quoted = t.match(/『([^』]{4,})』/);
  if (quoted) t = quoted[1];
  // 箇条書き・セッションマーカー（●【…】 ● ○）を除去
  t = t.replace(/[●○]\s*【[^】]*】/g, ' ').replace(/[●○]/g, ' ');
  // 先頭に並ぶ表ヘッダー語（月日（曜日） イベント名 場 所 …）を除去
  t = t.replace(/^(?:月日\s*[（(]?\s*曜日\s*[）)]?|イベント名|開催\s*日時?|場\s*所|時\s*間|種\s*類|区\s*分|内\s*容|[（()）\s])+/, '');
  // 「時間…」「場所…」「開催…」以降は本文ではないので切り落とす（語の除去より前に行う）
  t = t.split(/\s*(?:時間|場所|日時|開催日|受付期間|受付|開場|開演|問合せ|お問[い合]*せ|連絡先|TEL|電話)\s*[／/:：]?/)[0];
  t = t.split(/\s*開催/)[0];
  // 区切りの全角スラッシュ以降（区切りだけ残った残骸）を切り落とす
  t = t.split(/\s*／/)[0];
  // 日付・時刻・曜日断片を除去（半角・全角数字の両対応）
  t = t.replace(/(?:令和|R|Ｒ)\s*[0-9０-９]{1,2}\s*年?\s*[0-9０-９]{1,2}\s*月\s*[0-9０-９]{1,2}\s*日?(?:[（(]\s*[月火水木金土日祝]\s*[）)])?/gi, '')
       .replace(/[0-9０-９]{4}\s*[年\/.-]\s*[0-9０-９]{1,2}\s*(?:月|[\/.-])\s*[0-9０-９]{1,2}\s*日?(?:[（(]\s*[月火水木金土日祝]\s*[）)])?/g, '')
       .replace(/[、,]?\s*[0-9０-９]{1,2}\s*[月\/.]?\s*[0-9０-９]{0,2}\s*日?\s*[（(][月火水木金土日祝][）)]/g, '')
       .replace(/[0-9０-９]{1,2}\s*[月\/.]\s*[0-9０-９]{1,2}\s*日?/g, '')
       .replace(/[0-9０-９]{1,2}\s*[:：]\s*[0-9０-９]{2}\s*[~〜\-－]?\s*(?:[0-9０-９]{1,2}\s*[:：]\s*[0-9０-９]{2})?/g, '')
       .replace(/[0-9０-９]{1,2}\s*時\s*[0-9０-９]{0,2}\s*分?\s*[~〜\-－]?\s*(?:[0-9０-９]{1,2}\s*時\s*[0-9０-９]{0,2}\s*分?)?/g, '')
       .replace(/[0-9０-９]{1,2}\s*月(?=\s|$)/g, '');
  // 注記（公式ページ参照／事前→…まで 等）
  t = t.replace(/[（(][^（()）]*(?:公式ページ|日程|ページ参照|参照|事前|まで)[^（()）]*[）)]/g, '');
  // 複数イベントが連結している場合は最初の項目だけ採用
  if ((t.match(/令和/g) || []).length >= 2) t = (t.split(/\s*令和[0-9０-９]/)[0] || t).trim();
  // 案内系の語
  t = t.replace(/詳しくはこちら|詳しくみる|詳細はこちら|VIEW\s*ALL|お知らせ|NEWS|一覧/gi, '')
       .replace(/[｜|»>]+/g, ' ')
       .replace(/\s+/g, ' ')
       .trim();
  // 先頭の曜日断片（「月祝)」など閉じ括弧で終わるものだけ）を除去。実在語の先頭（水辺/金沢等）は残す
  t = t.replace(/^(?:[月火水木金土日祝][・･]?){1,3}[）)]\s*/, '').trim();
  t = t.replace(/^[\s・,、)）]+/, '').trim();
  // 未閉じ括弧の整理（開きが多い場合は最後の開き以降を削る）
  if ((t.match(/（/g) || []).length > (t.match(/）/g) || []).length) t = t.replace(/（[^（）]*$/, '').trim();
  if ((t.match(/\(/g) || []).length > (t.match(/\)/g) || []).length) t = t.replace(/\([^()]*$/, '').trim();
  // 先頭・末尾の記号類を除去（括弧 （）() は正規の閉じを壊さないため対象外）
  t = t.replace(/^[\s／/:：、,．.\-–—~〜＝=【】\[\]<>!！#＃]+|[\s／/:：、,．.\-–—~〜＝=【】\[\]<>、]+$/g, '').trim();
  if (maxLen > 0 && t.length > maxLen) t = t.slice(0, maxLen).trim();
  return t; // 救済不能（空）の場合は空を返す（呼び出し側で除外）
}

/** 全イベント共通: 末尾の誘導文言（詳細はこちら 等）を除去 */
function stripTrailingCta(raw) {
  if (!raw) return raw;
  const t = String(raw)
    .replace(/(?:詳細はこちら(?:から|をご覧ください)?|詳しくはこちら|詳しくみる|こちらをご覧ください|こちらから|こちら|詳細を見る)\s*$/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return t || raw;
}

/**
 * 募集案内所イベントの「場所」欄を整形する。
 * 「時間／…場所／会場…」のように時間と場所が混ざった塊から会場名だけを取り出す。
 */
function cleanOfficePlace(raw) {
  if (!raw) return '';
  let p = String(raw).replace(/\s+/g, ' ').trim();
  // 「場所／…」「場所：…」があれば、その後ろ（会場名）を採用
  const m = p.match(/場\s*所\s*[／/:：]?\s*(.+)$/);
  if (m) p = m[1].trim();
  // 残った「時間／…」断片を除去
  p = p.replace(/時\s*間\s*[／/:：].*$/, '').trim();
  // 時刻表現を除去
  p = p.replace(/[0-9０-９]{1,2}\s*[:：時]\s*[0-9０-９]{0,2}\s*分?\s*[~〜\-－]?\s*(?:[0-9０-９]{1,2}\s*[:：時]\s*[0-9０-９]{0,2}\s*分?)?/g, '').trim();
  // 末尾の活動内容（一般公開・展示広報・募集ブース設置 等）を除去
  p = p.replace(/(?:一般公開|展示広報|募集ブース設置|・展示広報|にて|ほか)+$/u, '').trim();
  p = p.replace(/^[／/:：、,・\s]+|[／/:：、,・\s]+$/g, '').trim();
  if (p.length > 40) p = p.slice(0, 40).trim();
  return p;
}

module.exports = { officeIsJunk, cleanOfficeTitle, cleanOfficePlace, stripTrailingCta, OFFICE_NONEVENT_RE, navMenuHits, weekdayCount };
