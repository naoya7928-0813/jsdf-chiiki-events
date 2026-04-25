'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, reiwaToAD, padTwo } = require('./utils');

/**
 * 石川地本イベントページのパーサー
 *
 * 構造: .event > .left-content 内に各イベント
 *   .event-title  → タイトル
 *   .event-date   → 日付「令和８年５月３１日（日）」
 *   .event-place  → 場所
 *
 * @param {import('cheerio').CheerioAPI} $
 * @returns {Array<Object>}
 */
function parseIshikawa($) {
  const events = [];
  let idx = 0;

  $('.event').each((i, el) => {
    // 最初の .event は "イベント情報" という見出し div のため除外
    const $el = $(el);
    if (!$el.find('.event-title').length) return;

    const title = $el.find('.event-title').text().replace(/\s+/g, ' ').trim();
    if (!title) return;

    const rawDate = toHalfWidth($el.find('.event-date').text().replace(/\s+/g, ' ').trim());

    // 令和Y年M月D日（曜日）
    const reiwaMatch = rawDate.match(/令和(\d+)年(\d+)月(\d+)日[（(]([月火水木金土日祝・]+)[）)]/);
    if (!reiwaMatch) return;

    const year    = reiwaToAD(parseInt(reiwaMatch[1], 10));
    const dateStr = `${year}-${padTwo(parseInt(reiwaMatch[2], 10))}-${padTwo(parseInt(reiwaMatch[3], 10))}`;
    if (isPast(dateStr)) return;

    const placeRaw = $el.find('.event-place').text().replace(/\s+/g, ' ').trim();

    events.push({
      id:             `ik-${dateStr.replace(/-/g, '')}-${++idx}`,
      pref:           'ishikawa',
      date:           dateStr,
      weekday:        reiwaMatch[4],
      title,
      place:          placeRaw,
      address:        '',
      time:           '',
      category:       guessCategory(toHalfWidth(title)),
      tag:            guessTag(title),
      url:            '',
      notes:          null,
      ageRequirement: null,
      deadline:       null,
      imageUrl:       '',
    });
  });

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

module.exports = { parseIshikawa };
