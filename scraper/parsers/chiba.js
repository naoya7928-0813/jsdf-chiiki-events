'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, reiwaToAD, padTwo } = require('./utils');

const BASE_URL = 'https://www.mod.go.jp/pco/chiba/event.html';

function resolveUrl(href) {
  if (!href) return '';
  if (href.startsWith('http')) return href;
  try { return new URL(href, BASE_URL).href; } catch { return ''; }
}

/**
 * @param {import('cheerio').CheerioAPI} $
 * @returns {Array<Object>}
 */
function parseChiba($) {
  const events = [];
  let idx = 0;

  $('section.subSec').each((_i, secEl) => {
    const $sec = $(secEl);

    const title = ($sec.find('h3[id]').first().text()
      || $sec.find('h3').first().text()
    ).replace(/\s+/g, ' ').trim();
    if (!title) return;

    const rawDate = toHalfWidth(
      ($sec.find('h4').first().text() || '').replace(/\s+/g, ' ').trim()
    );
    if (!rawDate) return;

    const dtMatch = rawDate.match(/令和(\d+)年(\d+)月(\d+)日[（(]([月火水木金土日祝・]+)[）)]/);
    if (!dtMatch) return;

    const year    = reiwaToAD(parseInt(dtMatch[1], 10));
    const month   = parseInt(dtMatch[2], 10);
    const day     = parseInt(dtMatch[3], 10);
    const weekday = dtMatch[4];
    const dateStr = `${year}-${padTwo(month)}-${padTwo(day)}`;
    if (isPast(dateStr)) return;

    const fields = {};
    $sec.find('dl dt').each((_k, dtEl) => {
      const key = toHalfWidth($(dtEl).text()).replace(/\s+/g, '').trim();
      fields[key] = $(dtEl).next('dd').text().replace(/\s+/g, ' ').trim();
    });

    const place = (fields['見学先'] || fields['場所'] || fields['会場'] || '').trim();
    const time  = toHalfWidth(fields['時間'] || fields['集合時間'] || fields['開催時間'] || fields['受付時間'] || '').trim();

    const rawCategory = fields['種目'] || fields['区分'] || fields['カテゴリ'] || '';
    const category    = rawCategory || guessCategory(toHalfWidth(title));
    const tag         = fields['備考'] ? guessTag(fields['備考']) : guessTag(title);

    const url      = resolveUrl($sec.find('a').first().attr('href') || '');
    const $img     = $sec.find('.imgContents');
    const imageUrl = resolveUrl($img.find('a').first().attr('href') || $img.find('img').first().attr('src') || '');

    events.push({
      id:             `cb-${dateStr.replace(/-/g, '')}-${++idx}`,
      pref:           'chiba',
      date:           dateStr,
      weekday,
      title,
      place,
      address:        '',
      time,
      category,
      tag,
      url,
      notes:          fields['実施内容'] || fields['内容'] || fields['備考'] || null,
      ageRequirement: toHalfWidth(fields['応募資格'] || '').trim() || null,
      deadline:       toHalfWidth(fields['応募締切'] || fields['締切'] || '').trim() || null,
      imageUrl,
    });
  });

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

module.exports = { parseChiba };
