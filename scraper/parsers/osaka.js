'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, reiwaToAD, padTwo } = require('./utils');

/**
 * 大阪地本イベントページ (experience/event.html) のパーサー
 *
 * 構造: h3 = イベント名、直後の table の「日時」行に開催日時、「場所」行に会場
 *   table row: "日時 | 令和8年4月25日(土) 08:00～15:00"
 *   table row: "場所 | 陸上自衛隊信太山駐屯地"
 *
 * @param {import('cheerio').CheerioAPI} $
 * @returns {Array<Object>}
 */
function parseOsaka($) {
  const events = [];
  let counter = 0;
  const SOURCE_URL = 'https://www.mod.go.jp/pco/osaka/experience/event.html';

  $('table').each((_, tbl) => {
    let dateStr = '', weekday = '', time = '', place = '';

    $(tbl).find('tr').each((_, tr) => {
      const cells = $(tr).find('td,th');
      if (cells.length < 2) return;
      const label = cells.first().text().trim().replace(/\s+/g, '');
      const value = cells.eq(1).text().trim().replace(/\s+/g, ' ');

      if (label === '日時' || label === '実施日') {
        // "令和8年4月25日(土) 08:00～15:00"
        const reiwaM = value.match(/令和(\d+)年(\d+)月(\d+)日[（(]([月火水木金土日祝]+)[）)]/);
        // "5月9日（日）11:00"
        const monthM = value.match(/(\d+)月(\d+)日[（(]([月火水木金土日祝]+)[）)]/);

        if (reiwaM) {
          const y = reiwaToAD(parseInt(reiwaM[1], 10));
          dateStr = `${y}-${padTwo(parseInt(reiwaM[2], 10))}-${padTwo(parseInt(reiwaM[3], 10))}`;
          weekday = reiwaM[4];
        } else if (monthM) {
          const now   = new Date();
          const m     = parseInt(monthM[1], 10);
          const d     = parseInt(monthM[2], 10);
          const inFut = m > now.getMonth() + 1 || (m === now.getMonth() + 1 && d >= now.getDate());
          dateStr = `${inFut ? now.getFullYear() : now.getFullYear() + 1}-${padTwo(m)}-${padTwo(d)}`;
          weekday = monthM[3];
        }
        const timeM = value.match(/(\d+:\d+[～〜]\d+:\d+)/);
        if (timeM) time = timeM[1];

      } else if (label === '場所') {
        place = value.split(/[（(]/)[0].trim(); // 住所部分は除く
      }
    });

    if (!dateStr || isPast(dateStr)) return;

    // 直前の h3 をタイトルとして使用（h2/h4/区切り要素はスキップ）
    let title = '';
    let el = $(tbl).prev();
    for (let i = 0; i < 8 && el.length; i++) {
      if (el.is('h3')) { title = el.text().trim(); break; }
      if (el.is('h2') || el.is('h4') || el.is('hr')) break;
      el = el.prev();
    }
    if (!title) return;

    events.push({
      id:             `os-${dateStr.replace(/-/g, '')}-${++counter}`,
      pref:           'osaka',
      date:           dateStr,
      weekday,
      title:          title.substring(0, 60),
      place,
      address:        '',
      time,
      category:       guessCategory(toHalfWidth(title)),
      tag:            guessTag(title),
      url:            SOURCE_URL,
      notes:          null,
      ageRequirement: null,
      deadline:       null,
      imageUrl:       '',
    });
  });

  return events;
}

module.exports = { parseOsaka };
