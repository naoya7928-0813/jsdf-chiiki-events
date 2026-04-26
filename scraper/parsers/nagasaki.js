'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, reiwaToAD, padTwo } = require('./utils');

const URL_NAGASAKI = 'https://www.mod.go.jp/pco/nagasaki/event/index.html';

/**
 * 長崎地本イベントページパーサー
 * 構造: <h3 class="title_bg_blue">令和X年Y月イベント一覧</h3>
 *        <div class="table_defa"><table>
 *          <tr><th>Y月Z日(曜)</th><td class="td01"><a>タイトル</a></td><td>時間／...場所／...</td></tr>
 *        </table></div>
 */
function parseNagasaki($) {
  const events = [];

  let currentYear = 0;
  let currentMonth = 0;

  $('h3, div.table_defa').each((_, el) => {
    const tag = (el.tagName || el.name || '').toLowerCase();

    if (tag === 'h3') {
      const t = toHalfWidth($(el).text());
      const m = t.match(/令和(\d+)年(\d+)月/);
      if (m) {
        currentYear  = reiwaToAD(parseInt(m[1], 10));
        currentMonth = parseInt(m[2], 10);
      }
      return;
    }

    if (!currentYear || !currentMonth) return;

    const month = currentMonth;
    const year  = currentYear;

    $(el).find('table tr').each((_, tr) => {
      const thText = toHalfWidth($(tr).find('th').text().replace(/\s+/g, ' ').trim());
      const tds    = $(tr).find('td');

      // 日付: "4月5日(日)" or "4月5日（日）"
      const dayM = thText.match(/(\d+)月(\d+)日[（(]([月火水木金土日祝]+)[）)]/);
      if (!dayM) return;

      const day     = parseInt(dayM[2], 10);
      const weekday = dayM[3];
      const dateStr = `${year}-${padTwo(month)}-${padTwo(day)}`;
      if (isPast(dateStr)) return;

      // タイトル: td.td01 or 2番目のtd
      const titleTd = tds.filter('.td01').first();
      const title   = toHalfWidth((titleTd.length ? titleTd : tds.eq(0)).text().trim());
      if (!title) return;

      // 時間と場所: 最後のtd
      const infoText = toHalfWidth(tds.last().text().replace(/\s+/g, ' ').trim());
      const timeM    = infoText.match(/時間[／/]([^場\n]+)/);
      const placeM   = infoText.match(/場所[／/]([^\n]+)/);
      const time     = timeM  ? timeM[1].trim().substring(0, 30)  : '';
      const place    = placeM ? placeM[1].trim().substring(0, 60) : '';

      events.push({
        id:             `ng-${dateStr.replace(/-/g, '')}-${events.length + 1}`,
        pref:           'nagasaki',
        date:           dateStr,
        weekday,
        title:          title.substring(0, 60),
        place,
        address:        '',
        time,
        category:       guessCategory(title),
        tag:            guessTag(title),
        url:            URL_NAGASAKI,
        notes:          null,
        ageRequirement: null,
        deadline:       null,
        imageUrl:       '',
      });
    });
  });

  return events;
}

module.exports = { parseNagasaki };
