'use strict';

/**
 * ocrDate.js — OCR テキストから開催日を取り出す
 *
 * 背景（2026-08 の障害）:
 *   OCR パイプラインは Tesseract / RapidOCR（ローカル）→ クラウド API の順に試すが、
 *   ローカル OCR の生テキストを構造化する parseTextToEvent が
 *   「YYYY年M月D日（曜）」形式の日付を必須にしていたため、行分割された OCR 出力を
 *   ほぼ全て取りこぼし、常に壊れたクラウド API へフォールバックしていた。
 *   実測では RapidOCR が 61 件の生テキストを取得しながら構造化成功は 0 件。
 *
 * ここでは実際のチラシに現れる表記を網羅して受け付ける:
 *   令和8年8月22日（土） / 令和8年8月22日
 *   2026年8月22日（土）  / 2026年8月22日
 *   8月22日（土）        / 8月22日
 *   2026/8/22（土）      / 2026.8.22 / 2026-08-22
 *   8/22（土）                       ← 曜日つきのみ無条件で許可
 *   日時 8/22                        ← 日付ラベルが近傍にある場合のみ許可
 *
 * 「8/22」のような区切り記号だけの表記は分数・比率・整理番号と紛らわしいため、
 * 曜日か日付ラベルのどちらかが無い限り採用しない（誤検出でゴミイベントを作らない）。
 */

const { reiwaToAD, reiwaNum, HEISEI_BASE, padTwo, toHalfWidth } = require('../parsers/utils');

const WEEKDAY_JP = ['日', '月', '火', '水', '木', '金', '土'];

/** 日付ラベル（「8/22」形式を採用してよいと判断する手がかり） */
const DATE_LABEL = /(?:日\s*時|日\s*程|開催日|実施日|開催|期日|とき|開\s*催)/;

/**
 * 区切り記号を半角に寄せる。
 * shared の toHalfWidth は全角英数字と「：」しか変換しないため、
 * 「8／22」「2026．8．22」のような全角区切りの日付を取りこぼしていた。
 * 日付判定にしか使わないので、ここで局所的に正規化する
 * （toHalfWidth 自体を変えると他パーサへ影響が及ぶ）。
 */
function normalizeSeparators(text) {
  return text
    .replace(/／/g, '/')
    .replace(/．/g, '.')
    .replace(/[－‐―ｰ]/g, '-');
}

/** 曜日表記を1文字に正規化する。取れなければ '' */
function normalizeWeekday(raw) {
  const s = String(raw || '').replace(/[\s・,、]/g, '');
  for (const ch of s) {
    if (WEEKDAY_JP.includes(ch)) return ch;   // 「土・日」「土日祝」は先頭の曜日を採用
  }
  return '';
}

/** 実在する暦日か（2月30日などを弾く） */
function isRealDate(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
}

/** JST の「今日」を YYYY-MM-DD で返す */
function jstToday(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * 年が明記されていない日付の西暦年を決める。
 *  - 曜日があれば曜日一致を最優先（現在年 → 翌年）。どちらとも一致しなければ確定しない。
 *    ＝古いチラシや OCR 誤読の可能性が高いので日付を作らない。
 *  - 曜日が無ければ「直近の将来」を採る（過去 7 日までは今年扱いで許容）。
 * @returns {number|null}
 */
function resolveYear(month, day, weekday, now = new Date()) {
  const today    = jstToday(now);
  const nowYear  = Number(today.slice(0, 4));
  const w        = normalizeWeekday(weekday);

  if (w) {
    for (const y of [nowYear, nowYear + 1]) {
      if (!isRealDate(y, month, day)) continue;
      const dt = new Date(Date.UTC(y, month - 1, day));
      if (WEEKDAY_JP[dt.getUTCDay()] === w) return y;
    }
    return null;  // 曜日が直近将来と一致しない → 確定不可
  }

  // 曜日が無い場合は手がかりが「月日」だけなので、窓を狭く取る。
  // 例: 8月18日時点の「8月1日」を翌年(+348日)と解釈すると、終わったチラシから
  // 1年後の架空イベントを作ってしまう。地本のイベント告知は長くても半年先まで。
  for (const y of [nowYear, nowYear + 1]) {
    if (!isRealDate(y, month, day)) continue;
    const iso  = `${y}-${padTwo(month)}-${padTwo(day)}`;
    const diff = (Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000;
    if (diff >= -7 && diff <= 200) return y;   // 直近7日前〜約半年先のみ
  }
  return null;
}

/**
 * テキストから日付表記の候補を、確度の高い順にすべて取り出す。
 *
 * 「最初に見つかった1件」だけを返す設計だと、実在ページの
 * `2026/00/00`（愛知地本トップに実在するプレースホルダ）のような壊れた表記を
 * 拾った時点で打ち切られ、後ろにある本物の日付を取り逃す。
 *
 * @returns {Array<{year:number|null, month:number, day:number, weekday:string, raw:string}>}
 */
function extractAllDateParts(text) {
  if (!text) return [];
  const t = normalizeSeparators(toHalfWidth(String(text)));
  const W = '[月火水木金土日祝・\\s]+';
  const out = [];

  // 1. 和暦（令和／平成）
  const wareki = new RegExp(`(令和|平成)\\s*(元|\\d{1,2})\\s*年\\s*(\\d{1,2})\\s*月\\s*(\\d{1,2})\\s*日(?:\\s*[（(](${W})[）)])?`, 'g');
  for (let m = wareki.exec(t); m; m = wareki.exec(t)) {
    const n    = reiwaNum(m[2]);
    const year = m[1] === '令和' ? reiwaToAD(n) : HEISEI_BASE + n;
    out.push({ year, month: Number(m[3]), day: Number(m[4]), weekday: normalizeWeekday(m[5]), raw: m[0] });
  }

  // 2. 西暦つき漢字表記
  const greg = new RegExp(`(\\d{4})\\s*年\\s*(\\d{1,2})\\s*月\\s*(\\d{1,2})\\s*日(?:\\s*[（(](${W})[）)])?`, 'g');
  for (let m = greg.exec(t); m; m = greg.exec(t)) {
    out.push({ year: Number(m[1]), month: Number(m[2]), day: Number(m[3]), weekday: normalizeWeekday(m[4]), raw: m[0] });
  }

  // 3. 西暦つき区切り表記（2026/8/22・2026.8.22・2026-08-22）
  const slashY = new RegExp(`(\\d{4})\\s*[/.\\-]\\s*(\\d{1,2})\\s*[/.\\-]\\s*(\\d{1,2})(?:\\s*[（(](${W})[）)])?`, 'g');
  for (let m = slashY.exec(t); m; m = slashY.exec(t)) {
    out.push({ year: Number(m[1]), month: Number(m[2]), day: Number(m[3]), weekday: normalizeWeekday(m[4]), raw: m[0] });
  }

  // 4. 年なし漢字表記（最頻出。曜日は任意）
  const kanji = new RegExp(`(\\d{1,2})\\s*月\\s*(\\d{1,2})\\s*日(?:\\s*[（(](${W})[）)])?`, 'g');
  for (let m = kanji.exec(t); m; m = kanji.exec(t)) {
    out.push({ year: null, month: Number(m[1]), day: Number(m[2]), weekday: normalizeWeekday(m[3]), raw: m[0] });
  }

  // 5. 年なし区切り表記（8/22・8.22）。曜日つき、または日付ラベルの近傍のみ採用する。
  //    末尾に数字が続くもの（8/222・1.25倍 など）は日付ではないので除外する。
  const re = new RegExp(`(\\d{1,2})\\s*[/.]\\s*(\\d{1,2})(?!\\s*[\\d/.])(?:\\s*[（(](${W})[）)])?`, 'g');
  for (let m = re.exec(t); m; m = re.exec(t)) {
    const month = Number(m[1]);
    const day   = Number(m[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    const weekday = normalizeWeekday(m[3]);
    const before  = t.slice(Math.max(0, m.index - 14), m.index);
    if (!weekday && !DATE_LABEL.test(before)) continue;   // 手がかりなし → 分数等と区別できない
    out.push({ year: null, month, day, weekday, raw: m[0] });
  }

  return out;
}

/**
 * テキストから最初に見つかった日付表記を取り出す（後方互換）。
 * @returns {{year:number|null, month:number, day:number, weekday:string, raw:string}|null}
 */
function extractDateParts(text) {
  return extractAllDateParts(text)[0] || null;
}

/**
 * テキストから開催日を ISO 文字列で取り出す。
 * @param {string} text
 * @param {{now?: Date, allowPast?: boolean}} [opts] allowPast=false なら過去日は null
 * @returns {{dateStr:string, weekday:string}|null}
 */
function parseDateFromText(text, opts = {}) {
  // 壊れた表記（2026/00/00 等）や過去日で打ち切らず、確定できる候補まで進む
  for (const parts of extractAllDateParts(text)) {
    const resolved = resolveDateParts(parts, opts);
    if (resolved) return resolved;
  }
  return null;
}

/**
 * extractDateParts の結果を ISO 日付に確定する。
 * @returns {{dateStr:string, weekday:string}|null}
 */
function resolveDateParts(parts, opts = {}) {
  if (!parts) return null;
  const { now = new Date(), allowPast = false } = opts;
  const { month, day } = parts;

  const year = parts.year != null ? parts.year : resolveYear(month, day, parts.weekday, now);
  if (year == null || !isRealDate(year, month, day)) return null;

  const dateStr = `${year}-${padTwo(month)}-${padTwo(day)}`;
  if (!allowPast && dateStr < jstToday(now)) return null;

  // 曜日は暦から引き直す（OCR 誤読の曜日をそのまま出さない）
  const weekday = WEEKDAY_JP[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return { dateStr, weekday };
}

/** ISO 日付を「YYYY年M月D日（曜）」表記に戻す（プロンプト非経由の内部受け渡し用） */
function toJpDateString({ dateStr, weekday }) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const w = weekday || WEEKDAY_JP[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${y}年${m}月${d}日（${w}）`;
}

module.exports = {
  extractDateParts,
  extractAllDateParts,
  resolveDateParts,
  parseDateFromText,
  toJpDateString,
  normalizeWeekday,
  isRealDate,
  resolveYear,
  jstToday,
  WEEKDAY_JP,
};
