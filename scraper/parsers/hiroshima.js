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

/**
 * 広島地本イベント詳細ページ（WP: events/NNNN/）から place / time を抽出する。
 * 本文は表ではなく「場所▶アルパーク東棟２階…」「場所：広島県合同庁舎１号館附属（大会議室）」の
 * ようなラベル行形式（区切りは ▶ / ：/ :）。<br> 区切りを改行に直してから行単位で探す。
 *
 * @param {import('cheerio').CheerioAPI} $
 * @returns {{ place: string, time: string }}
 */
function parseHiroshimaDetail($) {
  const content = $('.entry-content, main, article').first();
  const html = (content.length ? content.html() : $('body').html()) || '';
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d|tr)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ');

  let place = '';
  let time = '';
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\s+/g, ' ').trim();
    if (!line) continue;
    if (!place) {
      const m = line.match(/^場所\s*[▶：:]\s*(.+)$/);
      if (m) place = m[1].trim().substring(0, 60);
    }
    if (!time) {
      // 「時間▶１１：００～１６：００」「日時：７月２５日(土）9:30～13:30」
      const half = line.replace(/[０-９：]/g, c => (c === '：' ? ':' : String.fromCharCode(c.charCodeAt(0) - 0xFEE0)));
      const m = half.match(/^(?:時間|日時)\s*[▶:]\s*.*?(\d{1,2}:\d{2}\s*[～〜~]\s*\d{1,2}:\d{2})/);
      if (m) time = m[1].replace(/\s+/g, '');
    }
    if (place && time) break;
  }
  return { place, time };
}

module.exports = { parseHiroshima, parseHiroshimaDetail };
