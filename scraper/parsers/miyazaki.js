'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, reiwaToAD, padTwo, titleHash } = require('./utils');

const URL_MIYAZAKI = 'https://www.mod.go.jp/pco/miyazaki/event.html';

/**
 * 宮崎地本イベントページパーサー
 * 構造: <li><span class="info"><span class="data">令和X年Y月Z日</span></span>
 *            <span class="title"><a href="...">タイトル</a></span></li>
 * 日付は令和年（令和7年8月28日）
 * ※ 日付は掲載日の場合もあるためisPastで過去分を除外
 */
function parseMiyazaki($) {
  const events = [];

  $('li').each((_, li) => {
    const dateText  = toHalfWidth($(li).find('.data').text().trim());
    const titleEl   = $(li).find('.title a, a').first();
    const rawTitle  = toHalfWidth(titleEl.text().trim().replace(/\s+/g, ' '));

    if (!rawTitle || !dateText) return;

    let dateStr = '', weekday = '';

    const rM = dateText.match(/令和(\d+)年(\d+)月(\d+)日/);
    const gM = dateText.match(/(\d{4})年(\d+)月(\d+)日/);

    if (rM) {
      dateStr = `${reiwaToAD(parseInt(rM[1], 10))}-${padTwo(parseInt(rM[2], 10))}-${padTwo(parseInt(rM[3], 10))}`;
    } else if (gM) {
      dateStr = `${gM[1]}-${padTwo(parseInt(gM[2], 10))}-${padTwo(parseInt(gM[3], 10))}`;
    }

    if (!dateStr || isPast(dateStr)) return;

    events.push({
      id:             `mz-${dateStr.replace(/-/g, '')}-${titleHash(dateStr, rawTitle.substring(0, 60))}`,
      pref:           'miyazaki',
      date:           dateStr,
      weekday,
      title:          rawTitle.substring(0, 60),
      place:          '',
      address:        '',
      time:           '',
      category:       guessCategory(rawTitle),
      tag:            guessTag(rawTitle),
      url:            URL_MIYAZAKI,
      notes:          null,
      ageRequirement: null,
      deadline:       null,
      imageUrl:       '',
    });
  });

  return events;
}

module.exports = { parseMiyazaki };
