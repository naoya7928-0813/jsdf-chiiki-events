'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, reiwaToAD, padTwo } = require('./utils');

const URL_KOCHI = 'https://www.mod.go.jp/pco/kochi/event_info.html';

/**
 * 高知地本イベントページパーサー
 * 構造: 「月日（曜日）|イベント名|場所」のシンプルテーブル
 * 日付形式: "5月16日（土）" or "令和X年Y月Z日（曜）"
 */
function parseKochi($) {
  const events = [];
  const now = new Date();

  $('table tr').each((_, tr) => {
    const cells = $(tr).find('td,th')
      .map((_, c) => toHalfWidth($(c).text().trim().replace(/\s+/g, ' '))).get();
    if (cells.length < 2) return;

    const dateCell = cells[0];
    const title    = cells[1].trim();
    const place    = (cells[2] || '').trim().substring(0, 60);

    if (!title || /月日|曜日/.test(dateCell)) return;

    let dateStr = '', weekday = '';

    const rM = dateCell.match(/令和(\d+)年(\d+)月(\d+)日[（(]([月火水木金土日祝]+)[）)]/);
    const gM = dateCell.match(/(\d+)月(\d+)日[（(]([月火水木金土日祝]+)[）)]/);

    if (rM) {
      dateStr = `${reiwaToAD(parseInt(rM[1], 10))}-${padTwo(parseInt(rM[2], 10))}-${padTwo(parseInt(rM[3], 10))}`;
      weekday = rM[4];
    } else if (gM) {
      const month = parseInt(gM[1], 10);
      const day   = parseInt(gM[2], 10);
      weekday     = gM[3];
      const year  = month > now.getMonth() + 1 || (month === now.getMonth() + 1 && day >= now.getDate())
        ? now.getFullYear() : now.getFullYear() + 1;
      dateStr = `${year}-${padTwo(month)}-${padTwo(day)}`;
    }

    if (!dateStr || isPast(dateStr)) return;

    events.push({
      id:             `ko-${dateStr.replace(/-/g, '')}-${events.length + 1}`,
      pref:           'kochi',
      date:           dateStr,
      weekday,
      title:          title.substring(0, 60),
      place,
      address:        '',
      time:           '',
      category:       guessCategory(title),
      tag:            guessTag(title),
      url:            URL_KOCHI,
      notes:          null,
      ageRequirement: null,
      deadline:       null,
      imageUrl:       '',
    });
  });

  return events;
}

module.exports = { parseKochi };
