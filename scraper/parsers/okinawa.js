'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, padTwo, titleHash } = require('./utils');

const URL_OKINAWA = 'https://www.mod.go.jp/pco/okinawa/event.html';

/**
 * 沖縄地本イベントページパーサー
 * 構造: <ul class="news_list"><li>
 *          <span class="tag">イベント情報</span>
 *          <span class="time">2025.7.4</span>
 *          <a href="...">タイトル</a></li></ul>
 * 日付形式: "YYYY.M.D"（<span class="time">内）
 */
function parseOkinawa($) {
  const events = [];

  $('li').each((_, li) => {
    const timeText = toHalfWidth($(li).find('.time, [class*="time"]').text().trim());
    const rawTitle = toHalfWidth($(li).find('a').first().text().trim().replace(/\s+/g, ' '));

    if (!rawTitle || !timeText) return;

    // "2025.7.4" → YYYY-MM-DD
    const m = timeText.match(/(\d{4})\.(\d+)\.(\d+)/);
    if (!m) return;

    const dateStr = `${m[1]}-${padTwo(parseInt(m[2], 10))}-${padTwo(parseInt(m[3], 10))}`;
    if (isPast(dateStr)) return;

    events.push({
      id:             `on-${dateStr.replace(/-/g, '')}-${titleHash(dateStr, rawTitle.substring(0, 60))}`,
      pref:           'okinawa',
      date:           dateStr,
      weekday:        '',
      title:          rawTitle.substring(0, 60),
      place:          '',
      address:        '',
      time:           '',
      category:       guessCategory(rawTitle),
      tag:            guessTag(rawTitle),
      url:            URL_OKINAWA,
      notes:          null,
      ageRequirement: null,
      deadline:       null,
      imageUrl:       '',
    });
  });

  return events;
}

module.exports = { parseOkinawa };
