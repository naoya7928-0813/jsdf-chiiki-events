'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, reiwaToAD, padTwo } = require('./utils');

const URL_KUMAMOTO = 'https://www.mod.go.jp/pco/kumamoto/event/index.html';

/**
 * 熊本地本イベントページパーサー
 * 構造: <h4>カテゴリ</h4><table><tr><th>日付</th><th>名称</th><th>場所</th>...
 * 横型テーブル5列: 日付 / 名称 / 場所 / 問い合せ先 / 電話番号
 * 日付形式: "令和8年6月7日(日)\n11時00分～13時00分"
 */
function parseKumamoto($) {
  const events = [];

  $('table tr').each((_, tr) => {
    const cells = $(tr).find('td,th')
      .map((_, c) => toHalfWidth($(c).text().trim().replace(/\s+/g, ' '))).get();
    if (cells.length < 2) return;

    const dateCell = cells[0];
    const title    = cells[1].trim();
    const place    = (cells[2] || '').split(/[（(（]/)[0].trim();

    if (!title || /日\s*付|説明会名|催事名/.test(dateCell)) return;

    let dateStr = '', weekday = '', time = '';

    const rM = dateCell.match(/令和(\d+)年(\d+)月(\d+)日[（(]([月火水木金土日祝]+)[）)]/);
    const gM = dateCell.match(/(\d{4})年(\d+)月(\d+)日[（(]([月火水木金土日祝]+)[）)]/);

    if (rM) {
      dateStr = `${reiwaToAD(parseInt(rM[1], 10))}-${padTwo(parseInt(rM[2], 10))}-${padTwo(parseInt(rM[3], 10))}`;
      weekday = rM[4];
    } else if (gM) {
      dateStr = `${gM[1]}-${padTwo(parseInt(gM[2], 10))}-${padTwo(parseInt(gM[3], 10))}`;
      weekday = gM[4];
    }
    if (!dateStr || isPast(dateStr)) return;

    // 時刻: "11時00分～13時00分" や "10:00～12:00"
    const tM = dateCell.match(/(\d+時\d+分)[～〜～](\d+時\d+分)/);
    const tM2 = dateCell.match(/(\d+:\d+)[～〜～](\d+:\d+)/);
    if (tM)  time = `${tM[1]}～${tM[2]}`;
    else if (tM2) time = `${tM2[1]}～${tM2[2]}`;

    events.push({
      id:             `km-${dateStr.replace(/-/g, '')}-${events.length + 1}`,
      pref:           'kumamoto',
      date:           dateStr,
      weekday,
      title:          title.substring(0, 60),
      place:          place.substring(0, 60),
      address:        '',
      time,
      category:       guessCategory(title),
      tag:            guessTag(title),
      url:            URL_KUMAMOTO,
      notes:          null,
      ageRequirement: null,
      deadline:       null,
      imageUrl:       '',
    });
  });

  return events;
}

module.exports = { parseKumamoto };
