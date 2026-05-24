'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, reiwaToAD, padTwo, titleHash } = require('./utils');

const URL_KAGOSHIMA = 'https://www.mod.go.jp/pco/kagoshima/event/index.html';

/**
 * 鹿児島地本イベントページパーサー（Vue.js + Tailwind CSS）
 * 構造: <dl><div><dt>イベント名</dt><dd><h3>タイトル</h3></dd></div>
 *            <div><dt>開催日時</dt><dd>令和X年Y月Z日（曜）HH:MM～HH:MM</dd></div>
 *            <div><dt>場所</dt><dd>...</dd></div></dl>
 */
function parseKagoshima($) {
  const events = [];

  $('dl').each((_, dl) => {
    let title = '', dateStr = '', weekday = '', place = '', time = '';

    $(dl).find('div').each((_, div) => {
      const dt = toHalfWidth($(div).find('dt').text().trim()).replace(/\s+/g, '');
      const dd = toHalfWidth($(div).find('dd').text().trim().replace(/\s+/g, ' '));

      if (/イベント名/.test(dt)) {
        title = dd.replace(/\n/g, '').trim().substring(0, 60);
      }
      if (/開催日時/.test(dt)) {
        const rM = dd.match(/令和(\d+)年(\d+)月(\d+)日[（(]([月火水木金土日祝]+)[）)]/);
        const gM = dd.match(/(\d{4})年(\d+)月(\d+)日[（(]([月火水木金土日祝]+)[）)]/);
        if (rM) {
          dateStr = `${reiwaToAD(parseInt(rM[1], 10))}-${padTwo(parseInt(rM[2], 10))}-${padTwo(parseInt(rM[3], 10))}`;
          weekday = rM[4];
        } else if (gM) {
          dateStr = `${gM[1]}-${padTwo(parseInt(gM[2], 10))}-${padTwo(parseInt(gM[3], 10))}`;
          weekday = gM[4];
        }
        const tM = dd.match(/(\d+:\d+)[～〜～](\d+:\d+)/);
        if (tM) time = `${tM[1]}～${tM[2]}`;
      }
      if (/^場所$/.test(dt) && !place) {
        place = dd.split(/[（(（\n]/)[0].trim().substring(0, 60);
      }
    });

    if (!title || !dateStr || isPast(dateStr)) return;

    events.push({
      id:             `ks-${dateStr.replace(/-/g, '')}-${titleHash(dateStr, title)}`,
      pref:           'kagoshima',
      date:           dateStr,
      weekday,
      title,
      place,
      address:        '',
      time,
      category:       guessCategory(title),
      tag:            guessTag(title),
      url:            URL_KAGOSHIMA,
      notes:          null,
      ageRequirement: null,
      deadline:       null,
      imageUrl:       '',
    });
  });

  return events;
}

module.exports = { parseKagoshima };
