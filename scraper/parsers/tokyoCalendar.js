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

const toHalf = (s) => String(s || '')
  .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
  .replace(/：/g, ':').replace(/[〜~]/g, '～');

/**
 * 文字列から時刻（「10:00～15:00」「12:00」）を取り出す。無ければ ''。
 * 日付部分（年月日・曜日）の後ろだけを見る（日付の数字を時刻と誤認しないため）。
 */
function extractTime(raw) {
  const s = toHalf(raw);
  const afterDate = s.replace(/^.*?\d{1,2}月\d{1,2}日(?:[（(][^）)]*[）)])?/, '');
  const m = afterDate.match(/(\d{1,2}):(\d{2})(?:\s*～\s*(\d{1,2}):(\d{2}))?/);
  if (!m) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return m[3] ? `${pad(m[1])}:${m[2]}～${pad(m[3])}:${m[4]}` : `${pad(m[1])}:${m[2]}`;
}

/**
 * 事務所ページ（例: koutou/index.html。calendar.js の link 先）のイベント表から、
 * タイトルと開催日が一致する行の本文を探して時刻を取り出す。
 *   <td class="section_title">宇都宮駐屯地見学</td>
 *   <td><p>令和８年１０月１９日（月）10:00～15:00<br>締切 １０月１２日（月）まで …</p></td>
 * calendar.js には開催日しか無いイベントが多く、時刻は事務所ページにだけ書かれている
 * （2026-09-23: チラシ OCR が時間切れで見送られた回に time が空で公開された）。
 * @param {import('cheerio').CheerioAPI} $
 * @param {{ title:string, date:string }} ev
 * @returns {{ time:string }|null}
 */
function extractOfficePageDetails($, ev) {
  const norm = (t) => toHalf(t).replace(/[\s　]/g, '');
  const want = norm(ev.title);
  const [, mo, d] = String(ev.date || '').split('-').map(Number);
  if (!want || !mo || !d) return null;
  let found = null;
  $('td.section_title, th.section_title').each((_i, el) => {
    if (found) return;
    if (norm($(el).text()) !== want) return;
    const body = toHalf($(el).nextAll('td').first().text());
    if (!new RegExp(`(?:^|\\D)${mo}月\\s*${d}日`).test(body)) return; // 同名の別日程を取り違えない
    found = { time: extractTime(body) };
  });
  return found;
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
          // 期間に時刻が書かれていれば使う（「2026年10月3日（土）12：00」）。無ければ空で返し、
          // 呼び出し側（fetchTokyo）が事務所ページの表から補う（推測はしない）
          time: extractTime(ev.period),
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

module.exports = { parseTokyoCalendar, extractEventsObject, formatDeadline, extractTime, extractOfficePageDetails, CALENDAR_URL };
