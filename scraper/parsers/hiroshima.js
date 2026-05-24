'use strict';

const { guessCategory, guessTag, isPast, titleHash } = require('./utils');

const URL_HIROSHIMA = 'https://www.mod.go.jp/pco/hiroshima/events/';

/**
 * 広島地本イベントページパーサー
 * 構造: WordPress + FullCalendar。<script> 内の calendarEvents JSON 配列を抽出。
 * 各エントリ: { title, start: "2026-04-25 00:00:00", url, thumbnail, color }
 */
function parseHiroshima($) {
  const events = [];

  let calEvents = [];
  $('script').each((_, s) => {
    const src = $(s).html() || '';
    const m = src.match(/var\s+calendarEvents\s*=\s*(\[[\s\S]*?\]);/);
    if (m) {
      try { calEvents = JSON.parse(m[1]); } catch {}
    }
  });

  for (const ev of calEvents) {
    const start = ev.start || '';
    const dateM = start.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!dateM) continue;

    const dateStr = `${dateM[1]}-${dateM[2]}-${dateM[3]}`;
    if (isPast(dateStr)) continue;

    const title = (ev.title || '').trim();
    if (!title) continue;

    const timeM = start.match(/(\d{2}:\d{2}):\d{2}$/);
    const time  = (timeM && timeM[1] !== '00:00') ? timeM[1] : '';

    events.push({
      id:             `hi-${dateStr.replace(/-/g, '')}-${titleHash(dateStr, title.substring(0, 60))}`,
      pref:           'hiroshima',
      date:           dateStr,
      weekday:        '',
      title:          title.substring(0, 60),
      place:          '',
      address:        '',
      time,
      category:       guessCategory(title),
      tag:            guessTag(title),
      url:            ev.url || URL_HIROSHIMA,
      notes:          null,
      ageRequirement: null,
      deadline:       null,
      imageUrl:       ev.thumbnail || '',
    });
  }

  return events;
}

module.exports = { parseHiroshima };
