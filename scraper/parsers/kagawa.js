'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, padTwo } = require('./utils');

const URL_KAGAWA = 'https://www.mod.go.jp/pco/kagawa/event.html';

/**
 * 香川地本イベントページパーサー
 * 構造: 「月　日|イベント名|場　所|備考」ヘッダーを持つテーブルが月ごとに存在
 * 月コンテキスト: テーブルの直前兄弟要素を prevAll() で遡り「【X月】」を探す
 */
function parseKagawa($) {
  const events = [];
  const now = new Date();

  $('table').each((_, tbl) => {
    const headerText = toHalfWidth($(tbl).find('tr').first().find('th,td')
      .map((_, c) => $(c).text()).get().join('')).replace(/\s+/g, '');
    if (!/月.*日.*イベント/.test(headerText)) return;

    // テーブルの直前要素を DOM で遡り【X月】を探す（同一ヘッダーが複数テーブルにあるため indexOf 不可）
    let month = 0;
    const $tbl = $(tbl);
    // まず同一階層の prevAll を試みる
    $tbl.prevAll().each((_, el) => {
      if (month) return false;
      const t = toHalfWidth($(el).text()).replace(/\s+/g, '');
      const m = t.match(/【(\d+)月】/);
      if (m) month = parseInt(m[1], 10);
    });
    // 見つからなければ親を 3 段遡って試みる
    if (!month) {
      let $cur = $tbl.parent();
      for (let depth = 0; depth < 3 && !month; depth++, $cur = $cur.parent()) {
        $cur.prevAll().each((_, el) => {
          if (month) return false;
          const t = toHalfWidth($(el).text()).replace(/\s+/g, '');
          const m = t.match(/【(\d+)月】/);
          if (m) month = parseInt(m[1], 10);
        });
      }
    }
    if (!month || month < 1 || month > 12) return;

    const month_num = month;
    const year  = month_num >= now.getMonth() + 1 ? now.getFullYear() : now.getFullYear() + 1;

    $(tbl).find('tr').slice(1).each((_, tr) => {
      const cells = $(tr).find('td,th')
        .map((_, c) => toHalfWidth($(c).text().trim().replace(/\s+/g, ' '))).get();
      if (cells.length < 2) return;

      const dayCell   = cells[0];
      const title     = cells[1].trim();
      const placeRaw  = (cells[2] || '').split(/[（☆]/)[0].trim();

      if (!title || /^月\s*日$/.test(dayCell)) return;

      const dayM = dayCell.match(/^(\d+)/);
      if (!dayM) return;
      const day = parseInt(dayM[1], 10);
      if (day < 1 || day > 31) return;

      const dateStr   = `${year}-${padTwo(month_num)}-${padTwo(day)}`;
      if (isPast(dateStr)) return;

      const weekdayM  = dayCell.match(/[（(]([月火水木金土日祝]+)[）)]/);

      events.push({
        id:             `kg-${dateStr.replace(/-/g, '')}-${events.length + 1}`,
        pref:           'kagawa',
        date:           dateStr,
        weekday:        weekdayM ? weekdayM[1] : '',
        title:          title.substring(0, 60),
        place:          placeRaw.substring(0, 60),
        address:        '',
        time:           '',
        category:       guessCategory(title),
        tag:            guessTag(title),
        url:            URL_KAGAWA,
        notes:          null,
        ageRequirement: null,
        deadline:       null,
        imageUrl:       '',
      });
    });
  });

  return events;
}

module.exports = { parseKagawa };
