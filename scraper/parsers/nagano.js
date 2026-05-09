'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, padTwo } = require('./utils');

/**
 * iCal テキストを行単位で解析して VEVENT ブロックを抽出する。
 * @param {string} icsText
 * @returns {Array<{summary:string, dtstart:string, location:string, description:string}>}
 */
function parseIcal(icsText) {
  const vevents = [];
  const lines   = icsText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n');

  // iCal の折り返し行（先頭スペース）を連結
  const unfolded = [];
  for (const line of lines) {
    if (line.startsWith(' ') || line.startsWith('\t')) {
      if (unfolded.length) unfolded[unfolded.length - 1] += line.slice(1);
    } else {
      unfolded.push(line);
    }
  }

  let inEvent = false;
  let current = {};

  for (const line of unfolded) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      current = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      inEvent = false;
      if (current.summary && current.dtstart) vevents.push({ ...current });
      continue;
    }
    if (!inEvent) continue;

    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(0, colon).toUpperCase();
    const val = line.slice(colon + 1).trim();

    if (key.startsWith('DTSTART')) current.dtstart      = val;
    if (key.startsWith('DTEND'))   current.dtend        = val;
    if (key === 'SUMMARY')         current.summary      = decodeIcalText(val);
    if (key === 'LOCATION')        current.location     = decodeIcalText(val);
    if (key === 'DESCRIPTION')     current.description  = decodeIcalText(val);
  }

  return vevents;
}

/** iCal エスケープ（\n \, \\）を展開 */
function decodeIcalText(s) {
  return s
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\\\/g, '\\')
    .trim();
}

/**
 * DTSTART 値（20260501T100000 or 20260501）を ISO date に変換。
 * @param {string} dtstart
 * @returns {{dateStr:string, weekday:string, time:string}}
 */
function parseDtstart(dtstart) {
  // 20260501T100000 or 20260501T100000Z
  const dtMatch = dtstart.replace(/[TZ]/g, ' ').trim().match(/^(\d{4})(\d{2})(\d{2})(?:\s+(\d{2})(\d{2})(\d{2}))?/);
  if (!dtMatch) return null;

  const dateStr = `${dtMatch[1]}-${dtMatch[2]}-${dtMatch[3]}`;
  let time = '';
  if (dtMatch[4]) {
    time = `${dtMatch[4]}:${dtMatch[5]}`;
  }

  const d = new Date(dateStr + 'T00:00:00');
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  const weekday  = weekdays[d.getDay()] || '';

  return { dateStr, weekday, time };
}

/**
 * iCal テキストをイベント配列にパースする汎用関数。
 *
 * @param {string} icsText  raw iCal テキスト
 * @param {string} prefId   都道府県ID（id プレフィックスに使用）
 * @returns {Array<Object>}
 */
function parseICalEvents(icsText, prefId) {
  const vevents = parseIcal(icsText);
  const events  = [];
  let idx = 0;

  for (const ve of vevents) {
    const parsed = parseDtstart(ve.dtstart);
    if (!parsed) continue;
    const { dateStr, weekday, time } = parsed;
    if (isPast(dateStr)) continue;

    const title = toHalfWidth(ve.summary || '').replace(/\s+/g, ' ').trim();
    if (!title) continue;

    const place = toHalfWidth(ve.location || '').replace(/\s+/g, ' ').trim();
    const rawDesc = ve.description
      ? ve.description
          .replace(/<br\s*\/?>/gi, ' ')
          .replace(/<[^>]*>/g, '')
          .replace(/\s+/g, ' ')
          .trim()
      : null;
    const notes = rawDesc || null;
    const shortId = prefId.slice(0, 2);

    events.push({
      id:             `${shortId}-${dateStr.replace(/-/g, '')}-${++idx}`,
      pref:           prefId,
      date:           dateStr,
      weekday,
      title,
      place,
      address:        '',
      time,
      category:       guessCategory(title),
      tag:            guessTag(title),
      url:            '',
      notes,
      ageRequirement: null,
      deadline:       null,
      imageUrl:       '',
    });
  }

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 長野地本 Google カレンダー iCal フィードのパーサー
 *
 * @param {string} icsText  raw iCal テキスト
 * @returns {Array<Object>}
 */
function parseNagano(icsText) {
  return parseICalEvents(icsText, 'nagano');
}

module.exports = { parseNagano, parseICalEvents };
