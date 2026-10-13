'use strict';
const { toHalfWidth } = require('../parsers/utils');
function createYearContext($) {
  const context = new WeakMap();
  let current = { strict: true };
  $('*').each((_i, el) => {
    if (/^h[1-6]$|^caption$/i.test(el.tagName || el.name || '')) {
      const text = toHalfWidth($(el).text());
      const western = text.match(/(20\d{2})\s*年(度)?/);
      const era = text.match(/令和\s*(元|\d{1,2})\s*年(度)?/);
      if (western) current = { strict: true, year: Number(western[1]), fiscal: !!western[2] };
      else if (era) current = { strict: true, year: 2018 + (era[1] === '元' ? 1 : Number(era[1])), fiscal: !!era[2] };
    }
    context.set(el, current);
  });
  return el => context.get(el) || { strict: true };
}
function isActivityReport(text) {
  return /ました|活動報告|実施報告|参加報告/.test(text || '');
}

// 過去の活動報告の本文に出る言い回し（見出しのすぐ後の段落で判定する）。
// 「受付は終了しました」のような告知は含めない（開催前のイベントにも出るため）。
const REPORT_BODY_RE = /(実施|開催|参加|出展|見学|体験|行い|行な?われ|開かれ|訪れ|紹介|説明|展示|協力|支援)(し|さ)?ました|大盛況|足を運んでいただ|立ち寄っていただ|名が参加|名の(生徒|学生|方)|ご来場いただきました|ありがとうございました/;
const WEEKDAYS = '日月火水木金土';
const HEADING_RE = /^h[1-6]$/i;

/**
 * 見出しなどの要素の直後に続く本文（次の見出しまで・最大 max 文字）。
 * 「「さがみ野ひばり祭」に参加（12/1）」のような見出しだけを見るとイベントに見えるが、
 * 続く段落が「…広報ブースを出展してきました」なら過去の活動報告（2026-10 に神奈川・相模原で35件誤掲載）。
 */
function followingText($, el, max = 400) {
  let out = '';
  let node = el;
  for (let depth = 0; depth < 3 && node && out.length < max; depth++) {
    let sib = $(node).next();
    while (sib.length && out.length < max) {
      const tag = (sib.get(0).tagName || sib.get(0).name || '');
      if (HEADING_RE.test(tag)) return out;
      out += ' ' + String(sib.text() || '').replace(/\s+/g, ' ').trim();
      sib = sib.next();
    }
    if (out.trim()) break;
    node = $(node).parent().get(0); // 兄弟が無ければ親の兄弟を見る（見出しが div で包まれている場合）
  }
  return out.slice(0, max);
}

/** 要素とその直後の本文から、過去の活動報告か判定する */
function isReportBlock($, el, ownText = '') {
  if (isActivityReport(ownText)) return true;
  return REPORT_BODY_RE.test(followingText($, el));
}

/**
 * 本文に「M月D日（曜）」「M/D（曜）」があり、決めた日付の曜日と食い違うか。
 * 年の書かれていない過去の記事を今年・来年の日付と取り違えたときの検出に使う。
 */
function weekdayConflict(text, dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ''));
  if (!m) return false;
  const mo = Number(m[2]); const d = Number(m[3]);
  const wd = WEEKDAYS[new Date(Date.UTC(Number(m[1]), mo - 1, d)).getUTCDay()];
  const t = String(text || '').normalize('NFKC');
  const re = new RegExp(`(?:(?<!\\d)${mo}月\\s*${d}日|(?<!\\d)${mo}/${d}(?!\\d))\\s*[(（]\\s*([日月火水木金土])`, 'g');
  let hit; let conflict = false;
  while ((hit = re.exec(t))) { if (hit[1] !== wd) conflict = true; else return false; }
  return conflict;
}

module.exports = { createYearContext, isActivityReport, followingText, isReportBlock, weekdayConflict, REPORT_BODY_RE };
