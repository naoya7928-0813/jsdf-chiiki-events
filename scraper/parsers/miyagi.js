'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, padTwo , titleHash } = require('./utils');

/**
 * 宮城地本トップページパーサー
 * URL: https://www.mod.go.jp/pco/miyagi/
 *
 * TOP ページの「EVENT新着イベント」セクション構造:
 *   <div id="toppage-news">
 *     <dl>
 *       <dt>NEWS 2026.4.25</dt><dd><a href="...">タイトル</a></dd>
 *       ...
 *     </dl>
 *   </div>
 *
 * event.html は 404 のため TOP ページから直接取得。
 *
 * @param {import('cheerio').CheerioAPI} $
 * @returns {Array<Object>}
 */
function parseMiyagi($) {
  const events = [];
  let idx = 0;

  // #toppage-news 内の dl > dt/dd ペア
  $('#toppage-news dl dt').each((_i, dt) => {
    const dtText = $(dt).text().replace(/\s+/g, ' ').trim();
    // "NEWS 2026.4.25" or "NEWS 2026.4.25-26"
    const dateMatch = dtText.match(/NEWS\s+(\d{4})\.(\d+)\.(\d+)/);
    if (!dateMatch) return;

    const year  = parseInt(dateMatch[1], 10);
    const month = parseInt(dateMatch[2], 10);
    const day   = parseInt(dateMatch[3], 10);
    const dateStr = `${year}-${padTwo(month)}-${padTwo(day)}`;
    if (isPast(dateStr)) return;

    const $dd    = $(dt).next('dd');
    const $a     = $dd.find('a');
    const title  = toHalfWidth(($a.length ? $a : $dd).text().replace(/\s+/g, ' ').trim());
    if (!title) return;

    const rawUrl = $a.attr('href') || '';
    // event.html は 404 のため内部アンカーリンクを除外
    const url = rawUrl.startsWith('event.html') ? '' :
                rawUrl.startsWith('http')       ? rawUrl :
                rawUrl ? `https://www.mod.go.jp/pco/miyagi/${rawUrl}` : '';

    const d = new Date(dateStr + 'T00:00:00');
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const weekday  = weekdays[d.getDay()] || '';

    events.push({
      id:             `mi-${dateStr.replace(/-/g, '')}-${titleHash(dateStr, title)}`,
      pref:           'miyagi',
      date:           dateStr,
      weekday,
      title,
      place:          '',
      address:        '',
      time:           '',
      category:       guessCategory(title),
      tag:            guessTag(title),
      url,
      notes:          null,
      ageRequirement: null,
      deadline:       null,
      imageUrl:       '',
    });
  });

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

module.exports = { parseMiyagi };
