'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, reiwaToAD, padTwo } = require('./utils');

/**
 * 山形地本イベントページのパーサー
 * URL: https://www.mod.go.jp/pco/yamagata/event/event.html
 *
 * 構造: table.designta2 > tbody > tr
 *   colspan=3 行 → 月ヘッダー（「令和８年４月開催のイベント予定」）
 *   通常行: td[0]=DD日(曜日), td[1]=イベント名<br><b>場所</b>：場所名, td[2]=担当
 *
 * @param {import('cheerio').CheerioAPI} $
 * @returns {Array<Object>}
 */
function parseYamagata($) {
  const events = [];
  let idx      = 0;
  let curYear  = 0;
  let curMonth = 0;

  $('table.designta2 tbody tr').each((_i, row) => {
    const $row   = $(row);
    const $cells = $row.children('td');

    // colspan=3 → 月ヘッダー
    if ($cells.length === 1 && $cells.first().attr('colspan') === '3') {
      const header = toHalfWidth($cells.first().text().replace(/\s+/g, ' ').trim());
      // "令和8年4月開催のイベント予定"
      const m = header.match(/令和(\d+)年(\d+)月/);
      if (m) {
        curYear  = reiwaToAD(parseInt(m[1], 10));
        curMonth = parseInt(m[2], 10);
      }
      return;
    }

    if ($cells.length < 2 || !curYear || !curMonth) return;

    // 日付: "19日(日)" または "8日～10日(金～日)"
    const rawDay = toHalfWidth($cells.eq(0).text().replace(/\s+/g, ' ').trim());
    const dayMatch = rawDay.match(/^(\d+)日[（(]([月火水木金土日祝・]+)[）)]/);
    if (!dayMatch) return;

    const day     = parseInt(dayMatch[1], 10);
    const weekday = dayMatch[2];
    const dateStr = `${curYear}-${padTwo(curMonth)}-${padTwo(day)}`;
    if (isPast(dateStr)) return;

    // タイトルと場所: td[1] の <br> を境に分割
    const $td1   = $cells.eq(1);
    const rawHtml = $td1.html() || '';

    // <br> 以降が場所情報
    const [titlePart, ...placeParts] = rawHtml.split(/<br\s*\/?>/i);
    const title = $(titlePart).length
      ? $(titlePart).text().trim()
      : (titlePart || '').replace(/<[^>]+>/g, '').trim();
    if (!title || title === '　' || title === '') return;

    const placeRaw = placeParts.join(' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const place = placeRaw.replace(/^(?:<b>)?場所\s*(?:<\/b>)?\s*[：:]\s*/i, '').trim();

    events.push({
      id:             `ya-${dateStr.replace(/-/g, '')}-${titleHash(dateStr, title)}`,
      pref:           'yamagata',
      date:           dateStr,
      weekday,
      title,
      place,
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

  const seen = new Set();
  return events
    .filter(e => {
      const key = `${e.date}-${e.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

module.exports = { parseYamagata };
