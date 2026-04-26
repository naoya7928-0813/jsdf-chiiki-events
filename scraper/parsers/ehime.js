'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, reiwaToAD, padTwo } = require('./utils');

const URL_EHIME = 'https://www.mod.go.jp/pco/ehime/event.html';

/**
 * 愛媛地本イベントページパーサー
 * 構造: ul.event ごとに1イベント
 *   ul.event の直前要素 → イベントタイトル
 *   ul.event > table の 日　時 行 → 日付・時間
 *   ul.event > table の 場　所 行 → 場所
 * 日付形式: 令和X年Y月Z日（曜）or 西暦YYYY年Y月Z日（曜）
 */
function parseEhime($) {
  const events = [];

  $('ul.event').each((i, ul) => {
    // タイトル: ul.event の直前要素テキスト
    const rawTitle = toHalfWidth($(ul).prev().text().replace(/\s+/g, ' ').trim());
    if (!rawTitle) return;

    let dateStr = '', weekday = '', place = '', time = '';

    $(ul).find('table tr').each((_, tr) => {
      const thText = $(tr).find('th').text().replace(/\s+/g, '');
      const tdText = toHalfWidth($(tr).find('td').text().replace(/\s+/g, ' ').trim());

      if (/日.*時/.test(thText)) {
        const rM = tdText.match(/令和(\d+)年(\d+)月(\d+)日[（(]([月火水木金土日祝]+)[）)]/);
        const gM = tdText.match(/(\d{4})年(\d+)月(\d+)日[（(]([月火水木金土日祝]+)[）)]/);
        if (rM) {
          dateStr = `${reiwaToAD(parseInt(rM[1], 10))}-${padTwo(parseInt(rM[2], 10))}-${padTwo(parseInt(rM[3], 10))}`;
          weekday = rM[4];
        } else if (gM) {
          dateStr = `${gM[1]}-${padTwo(parseInt(gM[2], 10))}-${padTwo(parseInt(gM[3], 10))}`;
          weekday = gM[4];
        }
        const tM = tdText.match(/(\d+時\d*分?)[～〜](\d+時\d*分?)/);
        if (tM) time = tM[0];
      }

      if (/場.*所/.test(thText) && !place) {
        place = tdText.split(/[（(（]/)[0].trim().substring(0, 60);
      }
    });

    if (!dateStr || isPast(dateStr)) return;

    events.push({
      id:             `em-${dateStr.replace(/-/g, '')}-${i + 1}`,
      pref:           'ehime',
      date:           dateStr,
      weekday,
      title:          rawTitle.substring(0, 60),
      place,
      address:        '',
      time,
      category:       guessCategory(rawTitle),
      tag:            guessTag(rawTitle),
      url:            URL_EHIME,
      notes:          null,
      ageRequirement: null,
      deadline:       null,
      imageUrl:       '',
    });
  });

  return events;
}

module.exports = { parseEhime };
