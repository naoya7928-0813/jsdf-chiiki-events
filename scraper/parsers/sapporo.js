'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, reiwaToAD, reiwaNum, padTwo, jstYear, resolveYearByWeekday } = require('./utils');

/**
 * 札幌地本イベントページのパーサー
 * 複数サブページをまとめてパースする（index.js で各ページのHTMLを渡す）
 *
 * 構造: table > tbody > tr
 *   th[scope="row"] または td[0] → 日付
 *   td[0] または td[1]           → イベント名（<a> を含む場合あり）
 *   td[1] または td[2]           → 場所
 *
 * 日付形式:
 *   "６月６日（土）"           → toHalfWidth → MM月DD日（曜日）
 *   "令和８年６月２６日（金）" → 令和変換
 *   "２０２６年７月２５日（土）～２７日（月）" → 先頭日のみ取得
 *
 * @param {import('cheerio').CheerioAPI} $
 * @param {string} categoryHint - sub-page に応じたカテゴリヒント
 * @param {string} prefixId - イベントIDのプレフィックス
 * @param {{ counter: number }} state - IDカウンター共有オブジェクト
 * @returns {Array<Object>}
 */
function parseSapporoPage($, categoryHint, prefixId, state, sourceUrl = '') {
  const events = [];

  function parseDate(raw) {
    const text = toHalfWidth(String(raw || '').replace(/\s+/g, ' ').trim());
    let m = text.match(/令和\s*(元|\d{1,2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日(?:\s*[（(]\s*([月火水木金土日祝・]+)\s*[）)])?/);
    if (m) {
      return {
        dateStr: `${reiwaToAD(reiwaNum(m[1]))}-${padTwo(Number(m[2]))}-${padTwo(Number(m[3]))}`,
        weekday: m[4] || '',
        raw: text,
      };
    }

    m = text.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日(?:\s*[（(]\s*([月火水木金土日祝・]+)\s*[）)])?/);
    if (m) {
      return {
        dateStr: `${m[1]}-${padTwo(Number(m[2]))}-${padTwo(Number(m[3]))}`,
        weekday: m[4] || '',
        raw: text,
      };
    }

    m = text.match(/(?:^|[^\d])(\d{1,2})\s*月\s*(\d{1,2})\s*日(?:\s*[（(]\s*([月火水木金土日祝・]+)\s*[）)])?/);
    if (m) {
      const month = Number(m[1]);
      const day = Number(m[2]);
      const weekday = m[3] || '';
      const year = resolveYearByWeekday(month, day, weekday, jstYear()) || jstYear();
      return {
        dateStr: `${year}-${padTwo(month)}-${padTwo(day)}`,
        weekday,
        raw: text,
      };
    }
    return null;
  }

  $('table tr').each((_j, row) => {
    const $cells = $(row).children('td, th');
    if ($cells.length < 2) return;

    const cells = $cells.toArray().map(el => ({
      el,
      text: $(el).text().replace(/\s+/g, ' ').trim(),
    }));

    // HTML改修で th/td や scope 属性が変わっても耐えるよう、
    // 行内から「実際に日付として解釈できるセル」を探す。
    let dateIdx = -1;
    let parsed = null;
    for (let i = 0; i < Math.min(cells.length, 3); i++) {
      const candidate = parseDate(cells[i].text);
      if (candidate) {
        dateIdx = i;
        parsed = candidate;
        break;
      }
    }
    if (!parsed || isPast(parsed.dateStr)) return;

    const titleCell = cells[dateIdx + 1];
    if (!titleCell) return;
    const title = $(titleCell.el).clone()
      .find('a').each((_k, a) => $(a).replaceWith($(a).text())).end()
      .text().replace(/\s+/g, ' ').trim();
    if (!title || /^(行事名|イベント名|内容)$/.test(title)) return;

    const placeCell = cells[dateIdx + 2];
    const place = placeCell
      ? $(placeCell.el).clone().find('br').replaceWith(' ').end().text().replace(/\s+/g, ' ').trim()
      : '';

    const timeMatch = parsed.raw.match(/(\d{1,2}:\d{2}\s*[～〜~\-]\s*\d{1,2}:\d{2})/);
    const time = timeMatch ? timeMatch[1].replace(/\s+/g, '').replace(/[〜~]/g, '～') : '';
    const cat = guessCategory(toHalfWidth(title)) || categoryHint;

    events.push({
      id:             `sp-${prefixId}-${parsed.dateStr.replace(/-/g, '')}-${++state.counter}`,
      pref:           'sapporo',
      date:           parsed.dateStr,
      weekday:        parsed.weekday,
      title,
      place,
      address:        '',
      time,
      category:       cat,
      tag:            guessTag(title),
      url:            sourceUrl,
      notes:          null,
      ageRequirement: null,
      deadline:       null,
      imageUrl:       '',
    });
  });

  return events;
}

module.exports = { parseSapporoPage };
