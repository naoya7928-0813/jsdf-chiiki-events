'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, reiwaToAD, padTwo , titleHash } = require('./utils');

/**
 * 福島地本イベントページのパーサー
 * URL: https://www.mod.go.jp/pco/fukushima/pr/event.html
 *
 * 構造: h3 がイベント名、直後の table が詳細
 *   table の th "実施日時" / "実施予定日" / "日　時" → span 内に日付
 *   table の th "会場" / "場　所" / "開催場所" → td に場所
 *   日付形式: "令和8年 5月30日(土) 10:30～15:30"
 *             "令和６年６月２８日(土)" (全角)
 *
 * @param {import('cheerio').CheerioAPI} $
 * @returns {Array<Object>}
 */
function parseFukushima($) {
  const events = [];
  let idx = 0;

  const DATE_TH = /実施日時|実施予定日|日\s*時/;
  const PLACE_TH = /会\s*場|場\s*所|開催場所/;

  // h3 + 直後の table をペアとして処理
  $('h3').each((_i, h3el) => {
    const title = $(h3el).text().replace(/\s+/g, ' ').trim();
    if (!title || title.includes('現在実績')) return;

    // 直後の table を探す（最大5要素先まで）
    let $next = $(h3el).next();
    let $tbl  = null;
    for (let k = 0; k < 5 && $next.length; k++) {
      if ($next.is('table')) { $tbl = $next; break; }
      const found = $next.find('table');
      if (found.length) { $tbl = found.first(); break; }
      $next = $next.next();
    }
    if (!$tbl) return;

    // 日付を探す
    let rawDate = '';
    let place   = '';

    $tbl.find('tr').each((_j, row) => {
      const $thText = $(row).find('th').text().trim();
      const $tdEl   = $(row).find('td');

      if (DATE_TH.test($thText) && !rawDate) {
        rawDate = toHalfWidth($tdEl.text().replace(/\s+/g, ' ').trim());
      }
      if (PLACE_TH.test($thText) && !place) {
        place = $tdEl.clone().find('br').replaceWith(' ').end()
          .text().replace(/\s+/g, ' ').trim();
      }
    });

    if (!rawDate) return;

    // パターン1: 令和Y年 M月D日(曜日) または 令和Y年M月D日(曜日)
    const m = rawDate.match(/令和(\d+)年\s*(\d+)月(\d+)日[（(]([月火水木金土日祝・]+)[）)]/);
    if (!m) return;

    const year    = reiwaToAD(parseInt(m[1], 10));
    const dateStr = `${year}-${padTwo(parseInt(m[2], 10))}-${padTwo(parseInt(m[3], 10))}`;
    const weekday = m[4];
    if (isPast(dateStr)) return;

    // 時間
    const timeMatch = rawDate.match(/(\d+:\d+[～〜]\d+:\d+)/);
    const time = timeMatch ? timeMatch[1] : '';

    events.push({
      id:             `fs-${dateStr.replace(/-/g, '')}-${titleHash(dateStr, title)}`,
      pref:           'fukushima',
      date:           dateStr,
      weekday,
      title,
      place,
      address:        '',
      time,
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

module.exports = { parseFukushima };
