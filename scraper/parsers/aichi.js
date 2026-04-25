'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, padTwo } = require('./utils');

/**
 * 愛知地本カレンダーページのパーサー（calendar.html）
 *
 * 構造: #calendarTrack > .calendar-slide（月ごと）
 *   .calendar-title → "2026年 4月"
 *   .calendar-day   → 1 日ぶん
 *     .day-col      → "4 (土)" (日付 + 曜日)
 *     .event-item   → イベント 1 件
 *       .event-label → 種別ラベル
 *       .event-link  → イベント名（<i> タグを除く）
 *
 * @param {import('cheerio').CheerioAPI} $
 * @returns {Array<Object>}
 */
function parseAichi($) {
  const events = [];
  let idx = 0;

  $('.calendar-slide').each((_i, slideEl) => {
    // "2026年 4月" → year=2026, month=4
    const monthText  = $(slideEl).find('.calendar-title').text().replace(/\s+/g, ' ').trim();
    const monthMatch = monthText.match(/(\d{4})年\s*(\d+)月/);
    if (!monthMatch) return;

    const year  = parseInt(monthMatch[1], 10);
    const month = parseInt(monthMatch[2], 10);

    $(slideEl).find('.calendar-day').each((_j, dayEl) => {
      const dayText  = $(dayEl).find('.day-col').text().replace(/\s+/g, ' ').trim();
      // "4 (土)" or "4 (土)"（括弧は半角・全角両対応）
      const dayMatch = dayText.match(/(\d+)\s*[（(]([月火水木金土日])[）)]/);
      if (!dayMatch) return;

      const day     = parseInt(dayMatch[1], 10);
      const weekday = dayMatch[2];
      const dateStr = `${year}-${padTwo(month)}-${padTwo(day)}`;
      if (isPast(dateStr)) return;

      $(dayEl).find('.event-item').each((_k, itemEl) => {
        // .event-link テキストから <i>（icon）を除く
        const title = $(itemEl).find('.event-link').clone()
          .find('i').remove().end()
          .text().replace(/\s+/g, ' ').trim();
        if (!title) return;

        const typeLabel = $(itemEl).find('.event-label').text().replace(/\s+/g, ' ').trim();

        events.push({
          id:             `ai-${dateStr.replace(/-/g, '')}-${++idx}`,
          pref:           'aichi',
          date:           dateStr,
          weekday,
          title,
          place:          '',
          address:        '',
          time:           '',
          category:       guessCategory(toHalfWidth(title)) || (typeLabel.includes('イベント') ? 'イベント' : '説明会'),
          tag:            guessTag(title),
          url:            '',
          notes:          typeLabel || null,
          ageRequirement: null,
          deadline:       null,
          imageUrl:       '',
        });
      });
    });
  });

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

module.exports = { parseAichi };
