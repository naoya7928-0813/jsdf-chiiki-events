'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, reiwaToAD, padTwo , titleHash } = require('./utils');

/**
 * 群馬地本イベントページのパーサー
 *
 * 構造: section[id] ごとに1イベント
 *   .event_ttl  → タイトル
 *   div.event_detail_list ul li[0] → 日付
 *   div.event_detail_list ul li[1] → 時間
 *   div.event_detail_list ul li[2] → 場所（<br> で住所と分割）
 *   h4 → 説明・備考
 *
 * @param {import('cheerio').CheerioAPI} $
 * @returns {Array<Object>}
 */
function parseGunma($) {
  const events = [];
  let idx = 0;

  $('section[id]').each((_i, secEl) => {
    const $sec = $(secEl);

    const title = $sec.find('.event_ttl').first().text().replace(/\s+/g, ' ').trim();
    if (!title) return;

    const $lis = $sec.find('div.event_detail_list ul li');
    if ($lis.length < 1) return;

    const rawDate = toHalfWidth($lis.eq(0).text().replace(/\s+/g, ' ').trim());
    if (!rawDate) return;

    // Gregorian: 2026/4/25（土） or 2026/5/5(火) or 2026/5/16(土)～17(日)
    const gregMatch = rawDate.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})[（(]([月火水木金土日祝・]+)[）)]/);
    // Reiwa: 令和8年5月14日（木）
    const reiwaMatch = rawDate.match(/令和(\d+)年(\d+)月(\d+)日[（(]([月火水木金土日祝・]+)[）)]/);

    let dateStr, weekday;
    if (gregMatch) {
      dateStr  = `${gregMatch[1]}-${padTwo(parseInt(gregMatch[2], 10))}-${padTwo(parseInt(gregMatch[3], 10))}`;
      weekday  = gregMatch[4];
    } else if (reiwaMatch) {
      const year = reiwaToAD(parseInt(reiwaMatch[1], 10));
      dateStr  = `${year}-${padTwo(parseInt(reiwaMatch[2], 10))}-${padTwo(parseInt(reiwaMatch[3], 10))}`;
      weekday  = reiwaMatch[4];
    } else {
      return; // 固定日付のないイベントはスキップ
    }
    if (isPast(dateStr)) return;

    const time     = toHalfWidth($lis.eq(1).text().replace(/\s+/g, ' ').trim());

    // li[2]: 場所 <br> 住所 の形式を分割（HTMLコメントを先に除去）
    const placeHtml   = $lis.eq(2).html() || '';
    const placeParts  = placeHtml
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .split('\n')
      .map(s => s.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    const place   = placeParts[0] || '';
    const address = placeParts[1] || '';

    const notes = $sec.find('h4').first().text().replace(/\s+/g, ' ').trim() || null;

    events.push({
      id:             `gu-${dateStr.replace(/-/g, '')}-${titleHash(dateStr, title)}`,
      pref:           'gunma',
      date:           dateStr,
      weekday,
      title,
      place,
      address,
      time,
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

module.exports = { parseGunma };
