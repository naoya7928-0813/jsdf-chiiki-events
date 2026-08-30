// イベントの状態（受付終了/中止）・締切日の判定ロジック（純粋・テスト可能）。
//
// 設計方針:
// - **誤判定防止を最優先**。「荒天時中止」「中止の場合あり」等の条件付き注意書きを
//   確定中止(cancelled)にしない。「定員に達し次第締切」「締切延長」を closed にしない。
// - 締切日は、原文(deadline)を保持しつつ、機械判定可能な ISO 日付(deadlineDate)へ
//   変換できる場合のみ変換する。年が無い締切は開催日から年を解決（年跨ぎ考慮）。
// - status は published / closed / cancelled のみを確定させる（draft は手動専用、
//   postponed は現状データに存在しないため導入しない＝別課題）。
// - 信頼度(confidence)と根拠(reason)を返し、呼び出し側（スクレイパー/データ品質）が
//   信頼度に応じて採否・警告を判断できるようにする。
'use strict';

const { isRealDate } = require('./weather.cjs');

/**
 * 終了したイベントを「終了済み」として公開に残す日数。
 * **スクレイパー（events.json の書き出し）と画面（表示フィルター）で同じ値を使う。**
 * 片方だけ変えると「データには在るのに画面に出ない／その逆」が起きるため、
 * ここを唯一の出どころにする。
 */
const ENDED_KEEP_DAYS = 7;

const STATUS = Object.freeze({
  PUBLISHED: 'published',
  CLOSED: 'closed',
  CANCELLED: 'cancelled',
  DRAFT: 'draft',
});
// 永続化を許可する status の集合（postponed は未導入。導入時は別課題で全経路更新）。
const STATUS_VALUES = new Set(['published', 'closed', 'cancelled', 'draft']);

/** 全角英数を半角へ、空白・改行を圧縮して比較しやすくする。 */
function normalizeText(input) {
  if (input == null) return '';
  let s = String(input);
  // 全角英数記号 → 半角
  s = s.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  // 各種空白（全角スペース・改行・タブ）を単一スペースへ
  s = s.replace(/[\s　]+/g, ' ');
  return s.trim();
}

// ── 中止(cancelled)判定 ────────────────────────────────────────────
// 条件付き注意書き（確定中止ではない）。これらは中止判定から除外する。
const CANCEL_CONDITIONAL = [
  /(?:荒天|悪天候|雨天|降雨|台風|天候|気象条件)[^。]{0,6}?(?:の場合)?[^。]{0,4}?中止/,
  /中止(?:又は|または|・)?(?:延期|変更)?(?:と|に)?なる場合/,
  /中止(?:する|の)?(?:可能性|場合|おそれ|恐れ)/,
  /中止の場合(?:が)?あ(?:り|る)/,
  /(?:状況|事情)により(?:は)?[^。]{0,6}?中止/,
  /中止(?:又は|または)変更/,
];
// 確定中止の語（文脈確認込み）。
const CANCEL_CONFIRMED = [
  /開催(?:を)?中止/,
  /中止(?:と|に)?なりました/,
  /中止いた?しました/,
  /中止(?:と|に)?します/,
  /中止いたします/,
  /中止のお知らせ/,
  /本(?:イベント|行事|催し)(?:は)?(?:、)?[^。]{0,10}?中止/,
  /(?:開催を)?見送(?:り|る|ります)/,
  // 見出しバッジ形式の中止表記。地本サイトはタイトル先頭に「【中止】」を付けて
  // 告知することが多く、本文に「中止します」等が無いため上の語では拾えなかった。
  // 括弧で囲まれた「中止」に限定するので「荒天中止」等の条件付き表記は誤検出しない。
  /[【\[［(（]\s*(?:開催)?中\s*止\s*[】\]］)）]/,
];

/**
 * 中止判定。条件付き注意書きを除去してから確定中止語を照合する。
 * @returns {{cancelled:boolean, reason:string, conditionalOnly:boolean}}
 */
function detectCancelled(text) {
  const t = normalizeText(text);
  if (!t) return { cancelled: false, reason: '', conditionalOnly: false };
  const hasConditional = CANCEL_CONDITIONAL.some((re) => re.test(t));
  // 条件付き語を伏字化してから確定語を判定（条件付きの「中止」で誤検出しない）
  let stripped = t;
  for (const re of CANCEL_CONDITIONAL) stripped = stripped.replace(new RegExp(re, 'g'), '〔条件付〕');
  const confirmed = CANCEL_CONFIRMED.find((re) => re.test(stripped));
  if (confirmed) {
    return { cancelled: true, reason: '中止告知', conditionalOnly: false };
  }
  return { cancelled: false, reason: '', conditionalOnly: hasConditional };
}

// ── 受付終了/募集終了(closed)判定（テキスト由来） ─────────────────────
// closed にしてはいけない（受付継続中/未確定・当日受付時刻）。
const CLOSED_NEGATIVE = [
  /定員に達し次第[^。]{0,4}?(?:締切|締め切|受付終了)/,
  /締(?:切|め切)(?:り)?(?:予定|は?未定)/,
  /(?:応募|申込|受付|募集)?[^。]{0,4}?(?:締切|締め切|期間|受付)(?:り)?を?延長/,
  // 当日の受付デスク終了「時刻」（例:「15:40受付終了」「受付終了 15:40」「受付終了時刻」）は
  // 申込の締切ではないため closed にしない。
  /\d{1,2}\s*[:：]\s*\d{2}\s*(?:に|まで)?\s*受付(?:を)?終了/,
  /受付(?:を)?終了\s*[:：]?\s*\d{1,2}\s*[:：]\s*\d{2}/,
  /受付(?:を)?終了(?:時刻|時間)/,
  // 条件付き（「定員に達した場合、受付終了の可能性有」等）は確定終了ではない。
  /(?:受付|募集|申込)(?:を)?(?:終了|締切|締め切り?)[^。]{0,4}?(?:可能性|場合|恐れ|おそれ|かも|することがあ)/,
  /定員に達した場合/,
];
// 確定 closed の語。
const CLOSED_CONFIRMED = [
  /受付(?:を)?終了(?:しました|いたしました)?/,
  /募集(?:を)?終了(?:しました|いたしました)?/,
  /申(?:込|し込)み?を?(?:締め切りました|締切りました|終了)/,
  /応募(?:を)?(?:締め切りました|締切りました|終了)/,
  /申込(?:み)?終了/,
  /定員に達したため[^。]{0,6}?(?:受付|募集)?[^。]{0,4}?(?:終了|締切)/,
  /締め切りました/,
];

/**
 * テキストからの受付終了判定（締切日ではなく明示文言のみ）。
 * @returns {{closed:boolean, reason:string}}
 */
function detectClosedText(text) {
  const t = normalizeText(text);
  if (!t) return { closed: false, reason: '' };
  // 否定（延長・次第締切・締切予定）を伏字化してから確定語を判定
  let stripped = t;
  for (const re of CLOSED_NEGATIVE) stripped = stripped.replace(new RegExp(re, 'g'), '〔継続〕');
  if (CLOSED_CONFIRMED.some((re) => re.test(stripped))) {
    return { closed: true, reason: '受付終了告知' };
  }
  return { closed: false, reason: '' };
}

// ── 締切日(deadlineDate)の解決 ───────────────────────────────────
const WEEKDAY_CHARS = '日月火水木金土';
const REIWA_BASE = 2018; // 令和N年 = 2018 + N（令和元年=2019）
const HEISEI_BASE = 1988; // 平成N年 = 1988 + N（平成元年=1989）

function reiwaNum(s) { return s === '元' ? 1 : Number(s); }

function pad2(n) { return String(n).padStart(2, '0'); }

/** y-m-d が実在日なら "YYYY-MM-DD"、なければ null。 */
function ymd(y, m, d) {
  const s = `${y}-${pad2(m)}-${pad2(d)}`;
  return isRealDate(s) ? s : null;
}

/** 指定日の曜日文字（日〜土）。 */
function weekdayChar(dateStr) {
  if (!isRealDate(dateStr)) return '';
  const dow = new Date(Date.parse(dateStr + 'T00:00:00Z')).getUTCDay();
  return WEEKDAY_CHARS[dow];
}

/**
 * 締切原文と開催日から締切 ISO 日付を解決する（純粋）。
 * - 明示年（令和/平成/西暦）があればその年を採用。
 * - 年が無い「M月D日」は開催日から年を解決：候補が開催日以前ならその年、
 *   開催日より後なら前年（12月締切→翌1月開催 等の年跨ぎ）。
 * - 曜日が付いていれば整合を確認し、合わなければ確定しない（誤読/古いチラシ対策）。
 * - "なし"/"null"/空 は null。
 * @returns {{date:string|null, hasYear:boolean, reliable:boolean}}
 */
function resolveDeadlineDate(deadlineText, eventDate) {
  const raw = normalizeText(deadlineText);
  const none = { date: null, hasYear: false, reliable: false };
  if (!raw) return none;
  if (/^(なし|null|未定|なし。)$/i.test(raw)) return none;

  const weekdayM = raw.match(new RegExp(`[（(]\\s*([${WEEKDAY_CHARS}祝])\\s*[）)]`));
  const wantWeekday = weekdayM ? weekdayM[1] : '';

  let y = null, m = null, d = null, hasYear = false;

  let mm = raw.match(/(?:令和|R)\s*(元|\d{1,2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/i);
  if (mm) { y = REIWA_BASE + reiwaNum(mm[1]); m = +mm[2]; d = +mm[3]; hasYear = true; }
  if (y == null) {
    mm = raw.match(/平成\s*(元|\d{1,2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
    if (mm) { y = HEISEI_BASE + reiwaNum(mm[1]); m = +mm[2]; d = +mm[3]; hasYear = true; }
  }
  if (y == null) {
    mm = raw.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
    if (mm) { y = +mm[1]; m = +mm[2]; d = +mm[3]; hasYear = true; }
  }
  if (y == null) {
    // 年なし「M月D日」
    mm = raw.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
    if (mm) { m = +mm[1]; d = +mm[2]; }
  }
  if (m == null || d == null) return none;

  if (!hasYear) {
    // 開催日から年を解決（締切は開催日以前）。
    if (!isRealDate(eventDate)) return none; // 基準が無ければ現在年を機械付与しない
    const ey = Number(eventDate.slice(0, 4));
    let cand = ymd(ey, m, d);
    if (cand && cand > eventDate) cand = ymd(ey - 1, m, d); // 年跨ぎ
    if (!cand) return none;
    y = Number(cand.slice(0, 4));
  }

  const iso = ymd(y, m, d);
  if (!iso) return none;

  // 曜日整合（付いている場合のみ）。祝日表記はスキップ扱い（曜日照合しない）。
  let reliable = true;
  if (wantWeekday && wantWeekday !== '祝') {
    if (weekdayChar(iso) !== wantWeekday) reliable = false;
  }
  return { date: iso, hasYear, reliable };
}

/**
 * 状態と締切日を統合判定（純粋）。信頼度の高い情報を優先する。
 * 優先度: 明示中止 > 明示受付終了 > 締切日経過による自動closed。
 * @param {object} a
 *   text        判定に使う結合テキスト（title + notes 等）
 *   deadline    締切原文
 *   eventDate   開催日 "YYYY-MM-DD"
 *   endDate     連日開催の終了日（任意）
 *   today       今日 "YYYY-MM-DD"
 * @returns {{status:string, statusReason:string, deadlineDate:string|null, confidence:'high'|'medium'|'low'}}
 */
function deriveStatus({ text = '', deadline = '', eventDate = '', endDate = '', today = '' } = {}) {
  const dl = resolveDeadlineDate(deadline, eventDate);
  const deadlineDate = dl.date;

  // 1) 明示中止（最優先）
  const cancel = detectCancelled(text);
  if (cancel.cancelled) {
    return { status: STATUS.CANCELLED, statusReason: cancel.reason, deadlineDate, confidence: 'high' };
  }

  // 2) 明示受付終了
  const closedText = detectClosedText(text);
  if (closedText.closed) {
    return { status: STATUS.CLOSED, statusReason: closedText.reason, deadlineDate, confidence: 'high' };
  }

  // 3) 締切日経過による自動 closed（信頼できる締切日が今日より前）
  //    ・曜日不整合など reliable=false は自動closedにしない
  //    ・締切日が開催日より1年以上前など不自然なものは採用しない（誤読/古い年）
  if (deadlineDate && dl.reliable && isRealDate(today) && deadlineDate < today) {
    const eff = isRealDate(endDate) ? endDate : eventDate;
    const notAbsurd = !isRealDate(eff) || (deadlineDate <= eff && deadlineDate >= yearBefore(eff));
    if (notAbsurd) {
      return { status: STATUS.CLOSED, statusReason: '締切日経過', deadlineDate, confidence: 'medium' };
    }
  }

  return { status: STATUS.PUBLISHED, statusReason: '', deadlineDate, confidence: 'high' };
}

/** dateStr の1年前（"YYYY-MM-DD"）。 */
function yearBefore(dateStr) {
  if (!isRealDate(dateStr)) return '';
  const y = Number(dateStr.slice(0, 4)) - 1;
  return `${y}${dateStr.slice(4)}`;
}

/**
 * 前回状態と新規判定のマージ（純粋）。
 * - 一度 cancelled になったイベントは、取得できなくなった/文言が消えただけでは
 *   published へ戻さない（中止表示の消失で復活させない）。
 * - closed → published への自動復帰も避ける（受付は通常再開しない）。ただし
 *   新判定が cancelled のときは cancelled を優先。
 * @param {string} prevStatus 前回の status（無ければ ''）
 * @param {{status:string,statusReason:string}} derived deriveStatus の結果
 */
function mergeStatus(prevStatus, derived) {
  const next = derived && derived.status ? derived.status : STATUS.PUBLISHED;
  if (prevStatus === STATUS.CANCELLED && next !== STATUS.CANCELLED) {
    return { status: STATUS.CANCELLED, statusReason: derived.statusReason || '中止告知（前回状態を維持）', sticky: true };
  }
  if (prevStatus === STATUS.CLOSED && next === STATUS.PUBLISHED) {
    return { status: STATUS.CLOSED, statusReason: derived.statusReason || '受付終了（前回状態を維持）', sticky: true };
  }
  return { status: next, statusReason: derived ? derived.statusReason : '', sticky: false };
}

module.exports = {
  STATUS, STATUS_VALUES, ENDED_KEEP_DAYS,
  normalizeText, detectCancelled, detectClosedText,
  resolveDeadlineDate, weekdayChar, deriveStatus, mergeStatus,
};
