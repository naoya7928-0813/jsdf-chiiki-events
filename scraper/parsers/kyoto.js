'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, reiwaToAD, padTwo, titleHash } = require('./utils');

/**
 * 京都地本イベントページ (kouhoushitsu/index.html) のパーサー
 *
 * 構造: 各イベント = 1テーブル
 *   row[0]: "実施日 | 広告"（ヘッダー）
 *   row[1]: "YYYY年M月D日(曜日) | ..."（日付）
 *   row[2]: "【■イベント名】 ... 【■場所】 ..."（詳細）
 *
 * @param {import('cheerio').CheerioAPI} $
 * @returns {Array<Object>}
 */
function parseKyoto($) {
  const events = [];
  const SOURCE_URL = 'https://www.mod.go.jp/pco/kyoto/kouhoushitsu/index.html';

  $('table').each((_, tbl) => {
    const rows = $(tbl).find('tr');
    if (rows.length < 2) return;

    // ヘッダー行に「実施日」がある場合のみ処理
    const firstCellText = $(rows[0]).find('td,th').first().text().trim();
    if (firstCellText !== '実施日') return;

    // 日付行（row[1]）の1列目
    const rawDate = $(rows[1]).find('td,th').first().text().trim().replace(/\s+/g, ' ');

    // 令和形式
    const reiwaM = rawDate.match(/令和(\d+)年(\d+)月(\d+)日[（(]([月火水木金土日祝・]+)[）)]/);
    // 西暦形式 "2026年5月17日(日)"
    const gregM  = rawDate.match(/(\d{4})年(\d+)月(\d+)日[（(]([月火水木金土日祝・]+)[）)]/);

    let dateStr = '', weekday = '';
    if (reiwaM) {
      const y = reiwaToAD(parseInt(reiwaM[1], 10));
      dateStr = `${y}-${padTwo(parseInt(reiwaM[2], 10))}-${padTwo(parseInt(reiwaM[3], 10))}`;
      weekday = reiwaM[4];
    } else if (gregM) {
      dateStr = `${gregM[1]}-${padTwo(parseInt(gregM[2], 10))}-${padTwo(parseInt(gregM[3], 10))}`;
      weekday = gregM[4];
    } else {
      return; // "平日" など特定日なしはスキップ
    }

    if (isPast(dateStr)) return;

    // 詳細行（row[2]）からイベント名・場所・時間を抽出
    const detail = rows.length > 2
      ? $(rows[2]).text().replace(/\s+/g, ' ').trim()
      : $(rows[1]).find('td,th').eq(1).text().replace(/\s+/g, ' ').trim();

    // イベント名: 「～」 または 【■イベント名】 の後
    const nameM = detail.match(/【■イベント名[】]】?\s*[「『]?([^「『】]+?)[」』]?\s*(?:【|$)/i)
      || detail.match(/[「『]([^「『]+)[」』]/);
    const title = nameM
      ? nameM[1].trim()
      : detail.substring(0, 40).trim();
    if (!title) return;

    // 場所
    const placeM = detail.match(/【■(?:場所|開催場所|会場)[】]】?\s*([^【]+?)(?:【|$)/i);
    const place  = placeM ? placeM[1].trim() : '';

    // 時間
    const timeM = detail.match(/(\d+:\d+[～〜]\d+:\d+)/);
    const time  = timeM ? timeM[1] : '';

    events.push({
      id:             `ky-${dateStr.replace(/-/g, '')}-${titleHash(dateStr, title.substring(0, 60))}`,
      pref:           'kyoto',
      date:           dateStr,
      weekday,
      title:          title.substring(0, 60),
      place,
      address:        '',
      time,
      category:       guessCategory(toHalfWidth(title)),
      tag:            guessTag(title),
      url:            SOURCE_URL,
      notes:          null,
      ageRequirement: null,
      deadline:       null,
      imageUrl:       '',
    });
  });

  return events;
}

module.exports = { parseKyoto };
