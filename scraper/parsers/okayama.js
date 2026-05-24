'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, reiwaToAD, padTwo, titleHash } = require('./utils');

const URL_OKAYAMA = 'https://www.mod.go.jp/pco/okayama/iku/kohogyoumu.html';

/**
 * 岡山地本イベントページパーサー
 * 構造: <h3>令和X年度</h3> / <h3>【　X月　】</h3> + <table> (日|催事名|場所|事前申込|備考)
 * 月は直前の h3 見出しから取得
 */
function parseOkayama($) {
  const events = [];
  const now = new Date();

  // 令和年度から西暦年度開始年を確定
  let fiscalStartYear = now.getFullYear();
  $('h2, h3').each((_, el) => {
    const t = toHalfWidth($(el).text());
    const m = t.match(/令和(\d+)年度/);
    if (m) fiscalStartYear = reiwaToAD(parseInt(m[1], 10));
  });

  let currentMonth = 0;

  // h3 と table を順番に処理
  $('h3, table').each((_, el) => {
    const tag = el.tagName ? el.tagName.toLowerCase() : '';
    if (tag === 'h3') {
      const t = toHalfWidth($(el).text()).replace(/\s+/g, '');
      const m = t.match(/【(\d+)月】/);
      if (m) currentMonth = parseInt(m[1], 10);
      return;
    }
    if (tag !== 'table' || !currentMonth) return;

    const month = currentMonth;
    // 月4以上はfiscalStartYear、1-3月はfiscalStartYear+1（年度をまたぐ）
    const year = month >= 4 ? fiscalStartYear : fiscalStartYear + 1;

    $(el).find('tr').each((_, tr) => {
      const cells = $(tr).find('td,th')
        .map((_, c) => toHalfWidth($(c).text().trim().replace(/\s+/g, ' '))).get();
      if (cells.length < 2) return;

      const dayCell = cells[0].replace(/\s+/g, '');
      const title   = cells[1].trim();
      const place   = (cells[2] || '').trim();

      // ヘッダー行スキップ
      if (!title || /^(日|催事名)$/.test(dayCell)) return;

      // 複数日（"2・3", "16･17"）は初日のみ
      const dayM = dayCell.match(/(\d+)/);
      if (!dayM) return;
      const day = parseInt(dayM[1], 10);
      if (day < 1 || day > 31) return;

      const dateStr = `${year}-${padTwo(month)}-${padTwo(day)}`;
      if (isPast(dateStr)) return;

      events.push({
        id:             `ok-${dateStr.replace(/-/g, '')}-${titleHash(dateStr, title.substring(0, 60))}`,
        pref:           'okayama',
        date:           dateStr,
        weekday:        '',
        title:          title.substring(0, 60),
        place:          place.substring(0, 60),
        address:        '',
        time:           '',
        category:       guessCategory(title),
        tag:            guessTag(title),
        url:            URL_OKAYAMA,
        notes:          null,
        ageRequirement: null,
        deadline:       null,
        imageUrl:       '',
      });
    });
  });

  return events;
}

module.exports = { parseOkayama };
