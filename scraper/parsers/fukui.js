'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, padTwo , titleHash } = require('./utils');

/**
 * 福井地本イベントページのパーサー
 *
 * 構造: dl 要素ごとに 1 件
 *   dt             → 日付「2026.4.26(日)」または「2026.5.3(日祝)～4(月祝)」
 *   dd[0](id=kyoutyou3) → イベント名
 *   dd[1]          → 場所（"場 所：..."）
 *   dd[2]          → 内容（"内 容：..."）
 *
 * @param {import('cheerio').CheerioAPI} $
 * @returns {Array<Object>}
 */
function parseFukui($) {
  const events = [];
  let idx = 0;

  $('dl').each((_i, dlEl) => {
    const $dl     = $(dlEl);
    const rawDate = toHalfWidth($dl.find('dt').text().replace(/\s+/g, ' ').trim());
    if (!rawDate) return;

    // "2026.4.26(日)" or "2026.5.3(日祝)～4(月祝)"
    const dateMatch = rawDate.match(/(\d{4})\.(\d{1,2})\.(\d{1,2})[（(]([月火水木金土日祝・〜～]+)[）)]/);
    if (!dateMatch) return;

    const dateStr = `${dateMatch[1]}-${padTwo(parseInt(dateMatch[2], 10))}-${padTwo(parseInt(dateMatch[3], 10))}`;
    if (isPast(dateStr)) return;

    const $dds = $dl.find('dd');
    const title = $dds.eq(0).text().replace(/\s+/g, ' ').trim();
    if (!title) return;

    const placeRaw = $dds.eq(1).text().replace(/\s+/g, ' ').trim();
    const place    = placeRaw.replace(/^場\s*所[：:]\s*/, '').trim();

    const contentRaw = $dds.eq(2).text().replace(/\s+/g, ' ').trim();
    const notes      = contentRaw.replace(/^内\s*容[：:]\s*/, '').trim() || null;

    events.push({
      id:             `fu-${dateStr.replace(/-/g, '')}-${titleHash(dateStr, title)}`,
      pref:           'fukui',
      date:           dateStr,
      weekday:        dateMatch[4],
      title,
      place,
      address:        '',
      time:           '',
      category:       guessCategory(toHalfWidth(title)),
      tag:            guessTag(title),
      url:            '',
      notes,
      ageRequirement: null,
      deadline:       null,
      imageUrl:       '',
    });
  });

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

module.exports = { parseFukui };
