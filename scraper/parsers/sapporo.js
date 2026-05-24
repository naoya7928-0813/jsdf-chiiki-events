'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, reiwaToAD, padTwo, jstYear } = require('./utils');

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

  $('table').each((_i, tbl) => {
    $(tbl).find('tbody tr').each((_j, row) => {
      const $row   = $(row);
      const $cells = $row.children('td, th');
      if ($cells.length < 2) return;

      // 日付: th[scope="row"] 優先
      const $dateTh = $row.find('th[scope="row"]');
      const rawDateFull = toHalfWidth(
        ($dateTh.length ? $dateTh : $cells.eq(0))
          .text().replace(/\s+/g, ' ').trim()
      );

      // 先頭の日付を取得（範囲 "A日～B日" の場合は A の部分）
      let dateStr, weekday;

      // パターン1: YYYY年M月D日（曜日） または 2026年7月25日（土）
      const gregFull = rawDateFull.match(/(\d{4})年(\d+)月(\d+)日[（(]([月火水木金土日祝・]+)[）)]/);
      // パターン2: 令和Y年M月D日（曜日）
      const reiwaFull = rawDateFull.match(/令和(\d+)年(\d+)月(\d+)日[（(]([月火水木金土日祝・]+)[）)]/);
      // パターン3: MM月DD日（曜日）（年なし）
      const monthOnly = rawDateFull.match(/^(\d+)月(\d+)日[（(]([月火水木金土日祝・]+)[）)]/);

      if (reiwaFull) {
        const year = reiwaToAD(parseInt(reiwaFull[1], 10));
        dateStr  = `${year}-${padTwo(parseInt(reiwaFull[2], 10))}-${padTwo(parseInt(reiwaFull[3], 10))}`;
        weekday  = reiwaFull[4];
      } else if (gregFull) {
        dateStr  = `${gregFull[1]}-${padTwo(parseInt(gregFull[2], 10))}-${padTwo(parseInt(gregFull[3], 10))}`;
        weekday  = gregFull[4];
      } else if (monthOnly) {
        const month = parseInt(monthOnly[1], 10);
        const day   = parseInt(monthOnly[2], 10);
        const year  = jstYear();
        dateStr = `${year}-${padTwo(month)}-${padTwo(day)}`;
        weekday = monthOnly[3];
      } else {
        return; // 日付なし行スキップ
      }

      if (isPast(dateStr)) return;

      // タイトル: th[scope="row"] がある場合は td[0]、ない場合は td[1]
      const titleIdx = $dateTh.length ? 0 : 1;
      const $titleCell = $cells.filter('td').eq(titleIdx);
      const title = $titleCell.clone()
        .find('a').each((_k, a) => $(a).replaceWith($(a).text())).end()
        .text().replace(/\s+/g, ' ').trim();
      if (!title) return;

      // 場所: タイトルの次のtd
      const placeIdx = titleIdx + 1;
      const place = $cells.filter('td').eq(placeIdx)
        .clone().find('br').replaceWith(' ').end()
        .text().replace(/\s+/g, ' ').trim();

      // 時間: 日付フィールド内のHH:MM～HH:MM
      const timeMatch = rawDateFull.match(/(\d+:\d+[～〜]\d+:\d+)/);
      const time = timeMatch ? timeMatch[1] : '';

      const cat = guessCategory(toHalfWidth(title)) || categoryHint;

      events.push({
        id:             `sp-${prefixId}-${dateStr.replace(/-/g, '')}-${++state.counter}`,
        pref:           'sapporo',
        date:           dateStr,
        weekday,
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
  });

  return events;
}

module.exports = { parseSapporoPage };
