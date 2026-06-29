// 東京地本イベントパーサー（2026年の新サイト構造に対応）
//
// 旧構造（/pco/tokyo/<office>/event.html・静的一覧）は廃止され 404 になった。
// 現在のイベントは event2/calendar.js の `const EVENTS = {...}` に集約され、
// カレンダーUIへ JS で描画される。ここではその JS データを取り出して
// イベントカードへ変換する（締切済みのイベントは元データでコメントアウトされ除外済み）。
//
// EVENTS の構造:
//   { 'YYYY-M': { <day>: [ {cat, office, title, period, target, desc, deadline, link, img} ] } }
'use strict';

const { guessCategory, guessTag, calcWeekday, titleHash, padTwo } = require('./utils');

const CALENDAR_URL = 'https://www.mod.go.jp/pco/tokyo/event2/calendar.js';
const BASE = 'https://www.mod.go.jp/pco/tokyo/event2/';
const WD = ['日', '月', '火', '水', '木', '金', '土'];

/**
 * JS ソースから `const EVENTS = { ... }` のオブジェクト本体を抽出する。
 * 文字列・行/ブロックコメントを考慮した波括弧走査で、コメント内のイベント
 * （締切済み）や文字列内の括弧に惑わされないようにする。
 */
function extractEventsObject(js) {
  if (typeof js !== 'string') return null;
  const m = js.match(/const\s+EVENTS\s*=\s*/);
  if (!m) return null;
  let i = m.index + m[0].length;
  if (js[i] !== '{') return null;
  const start = i;
  let depth = 0, str = null, inLine = false, inBlock = false;
  for (; i < js.length; i++) {
    const c = js[i], n = js[i + 1];
    if (inLine) { if (c === '\n') inLine = false; continue; }
    if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++; } continue; }
    if (str) { if (c === '\\') { i++; continue; } if (c === str) str = null; continue; }
    if (c === '/' && n === '/') { inLine = true; i++; continue; }
    if (c === '/' && n === '*') { inBlock = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { str = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return js.slice(start, i + 1); }
  }
  return null;
}

/** 抽出したオブジェクト本体を評価して JS オブジェクトにする（オブジェクトリテラルのみ）。 */
function evalEvents(js) {
  const objText = extractEventsObject(js);
  if (!objText) return null;
  try {
    // eslint-disable-next-line no-new-func
    return (new Function('return (' + objText + ');'))();
  } catch {
    return null;
  }
}

/** 相対リンクを絶対URLへ（前後空白を除去。空は ''）。 */
function toAbsUrl(rel) {
  const s = String(rel || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  try { return new URL(s, BASE).href; } catch { return ''; }
}

/**
 * 締切文字列を可能なら「M月D日（曜）」へ。曜日が元にあれば採用、無く年が分かれば算出。
 * 日付として解釈できなければ null（呼び出し側で notes に退避）。
 */
function formatDeadline(raw, year) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const m = s.match(/(\d{1,2})月(\d{1,2})日(?:（([日月火水木金土])）)?/);
  if (!m) return null;
  const mo = Number(m[1]), d = Number(m[2]);
  let wd = m[3];
  if (!wd && year) {
    const t = new Date(Date.UTC(year, mo - 1, d));
    if (!Number.isNaN(t.getTime())) wd = WD[t.getUTCDay()];
  }
  return wd ? `${mo}月${d}日（${wd}）` : `${mo}月${d}日`;
}

/**
 * calendar.js のテキストを受け取り、東京のイベント配列（整形前）を返す。
 * 整形・不正除外・重複統合・ジオコーディングは writeOutput の共通パイプラインで行う。
 */
function parseTokyoCalendar(jsText) {
  const EVENTS = evalEvents(jsText);
  if (!EVENTS || typeof EVENTS !== 'object') return [];
  const out = [];

  for (const monthKey of Object.keys(EVENTS)) {
    const mk = monthKey.match(/^(\d{4})-(\d{1,2})$/);
    if (!mk) continue;
    const year = Number(mk[1]), month = Number(mk[2]);
    const days = EVENTS[monthKey] || {};
    for (const dayKey of Object.keys(days)) {
      const day = Number(dayKey);
      if (!day || !Array.isArray(days[dayKey])) continue;
      for (const ev of days[dayKey]) {
        if (!ev || !ev.title) continue;
        const date = `${year}-${padTwo(month)}-${padTwo(day)}`;

        // 連日開催: period の「～(M月)D日」から終了日を推定（開始日より後のときのみ）
        let endDate;
        const r = String(ev.period || '').match(/[〜～~]\s*(?:(\d{1,2})月)?(\d{1,2})日/);
        if (r) {
          const em = r[1] ? Number(r[1]) : month;
          const ed = Number(r[2]);
          const ey = em < month ? year + 1 : year;
          const cand = `${ey}-${padTwo(em)}-${padTwo(ed)}`;
          if (cand > date) endDate = cand;
        }

        const title = String(ev.title).trim();
        const place = String(ev.office || '').trim();
        const descParts = [];
        if (ev.desc) descParts.push(String(ev.desc).trim());
        const deadlineRaw = String(ev.deadline || '').trim();
        const deadline = formatDeadline(deadlineRaw, year);
        // 日付化できない締切（「希望日の2日前まで」等）は notes に残す
        if (deadlineRaw && !deadline) descParts.push(`応募締切: ${deadlineRaw}`);

        const text = `${title} ${ev.desc || ''}`;
        out.push({
          id: `t-${date.replace(/-/g, '')}-${titleHash(date, title + place)}`,
          pref: 'tokyo',
          date,
          ...(endDate ? { endDate } : {}),
          weekday: calcWeekday(date),
          ...(endDate ? { endWeekday: calcWeekday(endDate) } : {}),
          title,
          place,
          time: '', // カレンダーは開催「期間」のみ。時刻は不明なので空（推測しない）
          category: guessCategory(text) || '広報活動',
          tag: guessTag(`${text} ${deadlineRaw}`) || '',
          ageRequirement: String(ev.target || '').trim() || null,
          deadline: deadline || null,
          url: toAbsUrl(ev.link),
          notes: descParts.join('\n') || null,
          imageUrl: toAbsUrl(ev.img),
          source_type: 'office_html',
        });
      }
    }
  }
  return out;
}

module.exports = { parseTokyoCalendar, extractEventsObject, formatDeadline, CALENDAR_URL };
