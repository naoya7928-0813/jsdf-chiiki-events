'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, reiwaToAD, padTwo, titleHash } = require('./utils');

const URL_BASE = 'https://www.mod.go.jp/pco/yamanashi/event.html';

/**
 * 山梨地本イベントページ（https://www.mod.go.jp/pco/yamanashi/event.html）のパーサー
 *
 * 2026-09 時点の構造（「説明会」「イベント予定」欄）:
 *   div.uketsuke > table > tr
 *     th  … 区分（「広報活動」「説明会」等）
 *     td  > h3 … イベント名
 *         > ul > li … 「【日時】令和８年９月２６日（土）１０時～１５時」「【場所】…」「【内容】…」
 *                      「【対象】…」「【締め切り】９月１７日（木）」「【申し込み】…」
 *   ※ li の中に <main> が紛れ込む崩れたマークアップがあるため、li は子孫まで拾う。
 *
 * 「参加者募集中のイベント」欄の div.event_block（.event_text > h3 ＋ 表 or 段落）にも対応する。
 * 公式ページがコメントアウトで残しているひな形は、表（開催日／締め切り／場所）形式。
 * 見出しが「準備中」のブロックは掲載なしとして飛ばす。
 *
 * 旧実装は .event_block の段落だけを見ていたため、構造変更後は毎回 0 件を返していた
 * （2026-09-23 山梨 3→0 件の原因）。
 *
 * @param {import('cheerio').CheerioAPI} $
 * @returns {Array<Object>}
 */
function parseYamanashi($) {
  const events = [];
  const seen = new Set();

  const push = (ev) => {
    if (!ev || !ev.title || !ev.date) return;
    if (isPast(ev.endDate || ev.date)) return;
    const key = `${ev.date}|${ev.title}`;
    if (seen.has(key)) return;
    seen.add(key);
    events.push(ev);
  };

  // ── div.uketsuke（区分 th ＋ h3 ＋ 【項目】リスト） ─────────────
  $('div.uketsuke table tr').each((_i, tr) => {
    const $tr = $(tr);
    const $td = $tr.find('td').first();
    const title = clean($td.find('h3').first().text());
    if (!title || title === '準備中') return;
    const kind = clean($tr.find('th').first().text());
    const fields = collectBracketFields($, $td.find('li'));
    push(buildEvent({ title, kind, fields }));
  });

  // ── div.event_block（.event_text > h3 ＋ 表 or 段落） ────────────
  $('div.event_block').each((_i, el) => {
    const $el = $(el);
    const title = clean($el.find('.event_text h3').first().text());
    if (!title || title === '準備中') return;
    const fields = {};
    // 表形式（開催日／締め切り／場所）
    $el.find('.event_text tr').each((_j, tr) => {
      const k = clean($(tr).find('th').first().text());
      const v = clean($(tr).find('td').first().text());
      if (k && v) fields[normalizeKey(k)] = v;
    });
    // 段落・リスト形式（【日時】… / 場所：…）。表の値があればそちらを優先する
    const listed = collectBracketFields($, $el.find('.event_text p, .event_text li'));
    for (const [k, v] of Object.entries(listed)) if (fields[k] == null) fields[k] = v;
    push(buildEvent({ title, kind: '', fields }));
  });

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

function clean(s) {
  return String(s || '').replace(/[\s　]+/g, ' ').trim();
}

/** 見出し語を正規化（「開催日」「日時」→ date、「締め切り」→ deadline 等） */
function normalizeKey(k) {
  const t = k.replace(/[【】\s:：]/g, '');
  if (/^(?:日時|開催日時?|日程|期日)$/.test(t)) return 'date';
  if (/^(?:場所|会場|開催場所)$/.test(t)) return 'place';
  if (/^(?:締め?切り?|応募締切|申込締切)$/.test(t)) return 'deadline';
  if (/^(?:対象|参加資格|応募資格)$/.test(t)) return 'target';
  if (/^(?:内容|活動内容|備考)$/.test(t)) return 'content';
  if (/^(?:申し?込み?|申込方法)$/.test(t)) return 'apply';
  return t;
}

/** 「【日時】…」「場所：…」形式の行を { date, place, … } に集める（最初に出た値を優先）。 */
function collectBracketFields($, $items) {
  const out = {};
  const notes = [];
  $items.each((_i, li) => {
    // 入れ子の li（崩れたマークアップ）は外側と内側で重複するので、子に li を持つものは飛ばす
    if ($(li).find('li').length) return;
    const line = clean($(li).text());
    if (!line) return;
    const m = line.match(/^【([^】]{1,10})】\s*(.*)$/) || line.match(/^(日時|場所|会場|対象|締め?切り?|内容)\s*[:：]\s*(.*)$/);
    if (m) {
      const key = normalizeKey(m[1]);
      if (out[key] == null && m[2]) out[key] = m[2].trim();
    } else if (/^※/.test(line)) {
      notes.push(line);
    }
  });
  if (notes.length) out.remarks = notes.join(' ');
  return out;
}

/** 日付文字列（令和／西暦／月日のみ）→ { date, weekday, rest }。rest は日付の後ろ（時刻等）。 */
function parseDate(raw) {
  const s = toHalfWidth(raw || '');
  let m = s.match(/令和\s*(元|\d+)\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*(?:[（(]([^）)]*)[）)])?/);
  if (m) {
    const y = reiwaToAD(m[1] === '元' ? 1 : parseInt(m[1], 10));
    return { date: `${y}-${padTwo(+m[2])}-${padTwo(+m[3])}`, weekday: weekdayOf(m[4]), rest: s.slice(m.index + m[0].length) };
  }
  m = s.match(/(\d{4})\s*[年/]\s*(\d{1,2})\s*[月/]\s*(\d{1,2})\s*日?\s*(?:[（(]([^）)]*)[）)])?/);
  if (m) {
    return { date: `${m[1]}-${padTwo(+m[2])}-${padTwo(+m[3])}`, weekday: weekdayOf(m[4]), rest: s.slice(m.index + m[0].length) };
  }
  return null;
}

/** 「祝月」「土」等から曜日1文字を取り出す（祝日表記は除く）。 */
function weekdayOf(s) {
  const m = String(s || '').match(/[月火水木金土日]/);
  return m ? m[0] : '';
}

/** 締切の表示文字列（半角化のみ。機械判定用の deadlineDate は writeOutput の status 導出で付く）。 */
function deadlineText(raw) {
  const s = clean(toHalfWidth(raw || ''));
  return s || null;
}

function buildEvent({ title, kind, fields }) {
  const d = parseDate(fields.date);
  if (!d) return null;
  const time = toHalfWidth(clean(d.rest).replace(/^[、,\s]+/, ''));
  const place = fields.place ? clean(toHalfWidth(fields.place)) : '';
  const notes = [fields.content, fields.apply ? `申込: ${fields.apply}` : '', fields.remarks]
    .filter(Boolean).join('\n') || null;
  const category = guessCategory(toHalfWidth(`${kind} ${title}`)) || guessCategory(toHalfWidth(title));
  return {
    id:             `ya-${d.date.replace(/-/g, '')}-${titleHash(d.date, title)}`,
    pref:           'yamanashi',
    date:           d.date,
    weekday:        d.weekday,
    title,
    place,
    address:        '',
    time,
    category,
    tag:            guessTag(`${title} ${fields.apply || ''}`),
    url:            URL_BASE,
    notes,
    ageRequirement: fields.target ? clean(toHalfWidth(fields.target)) : null,
    deadline:       deadlineText(fields.deadline),
    imageUrl:       '',
  };
}

module.exports = { parseYamanashi };
