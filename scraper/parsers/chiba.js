'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, padTwo } = require('./utils');

const BASE_URL = 'https://www.mod.go.jp/pco/chiba/event.html';

/** 令和年なしの「X月Y日」→ スクレイピング時の西暦を返す（過去日は isPast() で除外）*/
function inferYear() {
  return new Date().getFullYear();
}

/**
 * 千葉: div.post 内に h3（タイトル）+ table（時期・場所等）の構造
 * 日付は「１１月３日（水・祝日）」形式（令和年なし、全角数字）
 *
 * @param {import('cheerio').CheerioAPI} $
 * @returns {Array<Object>}
 */
function parseChiba($) {
  const events = [];
  let idx = 0;

  $('div.post h3').each((_i, h3El) => {
    const title = $(h3El).text().replace(/\s+/g, ' ').trim();
    if (!title) return;

    // h3 の次の兄弟要素から table を探す（次の h3 まで）
    let $el    = $(h3El).next();
    let $table = null;

    while ($el.length && !$el.is('h3')) {
      if ($el.is('table')) {
        $table = $el;
        break;
      }
      const inner = $el.find('table').first();
      if (inner.length) {
        $table = inner;
        break;
      }
      $el = $el.next();
    }

    if (!$table) return;

    // table の th/td ペアからフィールドを収集
    const fields = {};
    $table.find('tr').each((_k, trEl) => {
      const th = $(trEl).find('th').first().text().replace(/\s+/g, '').trim();
      const td = $(trEl).find('td').first().text().replace(/\s+/g, ' ').trim();
      if (th) fields[th] = td;
    });

    // 日時: "時期" または "日時" フィールド（全角→半角変換）
    const rawDate = toHalfWidth(fields['時期'] || fields['日時'] || fields['開催日'] || '');
    if (!rawDate) return;

    // 月・日・曜日を抽出
    const dtMatch = rawDate.match(/(\d+)月(\d+)日[（(]([月火水木金土日祝・]+)[）)]/);
    if (!dtMatch) return;

    const month   = parseInt(dtMatch[1], 10);
    const day     = parseInt(dtMatch[2], 10);
    const weekday = dtMatch[3];
    const year    = inferYear(month, day);
    const dateStr = `${year}-${padTwo(month)}-${padTwo(day)}`;
    if (isPast(dateStr)) return;

    const place = (fields['場所'] || fields['会場'] || '').trim();
    const time  = toHalfWidth(fields['時間'] || fields['開催時間'] || fields['受付時間'] || '').trim();

    events.push({
      id:             `cb-${dateStr.replace(/-/g, '')}-${titleHash(dateStr, title)}`,
      pref:           'chiba',
      date:           dateStr,
      weekday,
      title,
      place,
      address:        '',
      time,
      category:       guessCategory(toHalfWidth(title)),
      tag:            guessTag(title),
      url:            '',
      notes:          fields['内容'] || fields['実施内容'] || fields['備考'] || null,
      ageRequirement: null,
      deadline:       null,
      imageUrl:       '',
    });
  });

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

module.exports = { parseChiba };
