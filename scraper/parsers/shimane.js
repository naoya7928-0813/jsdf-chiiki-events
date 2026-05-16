'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, reiwaToAD, padTwo } = require('./utils');

const URL_SHIMANE = 'https://www.mod.go.jp/pco/shimane/event/event.html';

/**
 * 島根地本イベントページパーサー
 * 構造: IFRAMEで event_src.html を読み込む形式（静的HTMLには直接データなし）
 * Playwright でレンダリングしても iframe ソースが 404 のため、
 * ページ内に直接書かれたテーブル・見出しからベストエフォートで取得する。
 * データが取れない場合は空配列を返す。
 */
function parseShimane($) {
  const events = [];
  const now = new Date();

  // テーブル形式のイベントリストを試みる
  $('table tr').each((_, tr) => {
    const cells = $(tr).find('td,th')
      .map((_, c) => toHalfWidth($(c).text().trim().replace(/\s+/g, ' '))).get();
    if (cells.length < 2) return;

    const dateCell = cells[0];
    const title    = cells[1].trim();
    if (!title || /月日|曜日|日程/.test(dateCell)) return;

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
      dateStr = `${now.getFullYear()}-${padTwo(month)}-${padTwo(day)}`;
    }

    if (!dateStr || isPast(dateStr)) return;

    events.push({
      id:             `sm-${dateStr.replace(/-/g, '')}-${events.length + 1}`,
      pref:           'shimane',
      date:           dateStr,
      weekday,
      title:          title.substring(0, 60),
      place:          (cells[2] || '').trim().substring(0, 60),
      address:        '',
      time:           '',
      category:       guessCategory(title),
      tag:            guessTag(title),
      url:            URL_SHIMANE,
      notes:          null,
      ageRequirement: null,
      deadline:       null,
      imageUrl:       '',
    });
  });

  return events;
}

module.exports = { parseShimane };
