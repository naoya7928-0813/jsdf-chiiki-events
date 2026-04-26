'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, padTwo } = require('./utils');

const URL_YAMAGUCHI = 'https://www.mod.go.jp/pco/yamaguchi/event.html';

/**
 * 山口地本イベントページパーサー
 * 構造: <h4 id="eventN" class="jump">タイトル</h4> の直後に縦型テーブル
 * 行構成: <th>日　時</th><td>４月２５日（土）10:00～15:00</td>
 *         <th>場　所</th><td>...</td>
 * 日付は全角数字（toHalfWidth で変換）、年は月で推定
 */
function parseYamaguchi($) {
  const events = [];
  const now = new Date();

  $('h4').each((_, h4) => {
    const rawTitle = toHalfWidth($(h4).text().trim());
    if (!rawTitle) return;

    // h4 直後の最初の table を探す（間にp等が入ることもある）
    const $table = $(h4).nextAll('table').first();
    if (!$table.length) return;

    let dateStr = '', weekday = '', place = '', time = '';

    $table.find('tr').each((_, tr) => {
      const thText = toHalfWidth($(tr).find('th').text()).replace(/\s+/g, '');
      const tdText = toHalfWidth($(tr).find('td').text().trim());

      if (/日.*時/.test(thText)) {
        const m = tdText.match(/(\d+)月(\d+)日[（(]([月火水木金土日祝]+)[）)]/);
        if (m) {
          const month = parseInt(m[1], 10);
          const day   = parseInt(m[2], 10);
          weekday     = m[3];
          // 常に当年で判定し isPast に委ねる（同月の直近過去日が翌年扱いになるのを防ぐ）
          const year  = now.getFullYear();
          dateStr = `${year}-${padTwo(month)}-${padTwo(day)}`;
          const tM = tdText.match(/(\d+:\d+)[～〜～](\d+:\d+)/);
          if (tM) time = `${tM[1]}～${tM[2]}`;
        }
      }
      if (/場.*所/.test(thText) && !place) {
        place = tdText.split(/[（(\n]/)[0].trim().substring(0, 60);
      }
    });

    if (!dateStr || isPast(dateStr)) return;

    events.push({
      id:             `ym-${dateStr.replace(/-/g, '')}-${events.length + 1}`,
      pref:           'yamaguchi',
      date:           dateStr,
      weekday,
      title:          rawTitle.substring(0, 60),
      place,
      address:        '',
      time,
      category:       guessCategory(rawTitle),
      tag:            guessTag(rawTitle),
      url:            URL_YAMAGUCHI,
      notes:          null,
      ageRequirement: null,
      deadline:       null,
      imageUrl:       '',
    });
  });

  return events;
}

module.exports = { parseYamaguchi };
