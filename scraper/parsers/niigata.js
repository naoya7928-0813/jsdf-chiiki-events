'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, padTwo , titleHash } = require('./utils');

const BASE_URL = 'https://www.mod.go.jp/pco/niigata/HP/';

/** MM月DD日 → ISO date string（年はスクレイピング時の西暦を使用、過去日は isPast() で除外）*/
function inferDate(month, day) {
  return `${new Date().getFullYear()}-${padTwo(month)}-${padTwo(day)}`;
}

/**
 * 新潟地本イベントページのパーサー
 *
 * 構造: h2（カテゴリ）+ table（列: 日程 / イベント名 / 場所）
 *   - 日付セル: td[0] の bold テキスト "4月25日（土）10:00～16:00"
 *   - 名前セル: td[1] または th[scope="row"]
 *   - 場所セル: td.dline または td[2]（Google Maps リンクを除く）
 *
 * @param {import('cheerio').CheerioAPI} $
 * @returns {Array<Object>}
 */
function parseNiigata($) {
  const events = [];
  let idx = 0;

  // h2 をカテゴリとして、直後の table を対応付ける
  $('h2').each((_i, h2el) => {
    const category = $(h2el).text().replace(/\s+/g, ' ').trim();

    // 次の h2 まで DOM を辿り table を探す
    let $cur = $(h2el).next();
    while ($cur.length && !$cur.is('h2')) {
      const $tables = $cur.is('table') ? $cur : $cur.find('table');
      $tables.each((_j, tbl) => {
        $(tbl).find('tbody tr').each((_k, row) => {
          const $row  = $(row);
          const $cells = $row.children('td, th');
          if ($cells.length < 2) return;

          // 日付: 先頭セルの bold テキスト（全角 → 半角変換）
          const rawDate = toHalfWidth($cells.eq(0).text().replace(/\s+/g, ' ').trim());
          const dateMatch = rawDate.match(/(\d+)月(\d+)日[（(]([月火水木金土日祝]+)[）)]/);
          if (!dateMatch) return;

          const month   = parseInt(dateMatch[1], 10);
          const day     = parseInt(dateMatch[2], 10);
          const weekday = dateMatch[3];
          const dateStr = inferDate(month, day);
          if (isPast(dateStr)) return;

          // 時間: 同一セル内の HH:MM～HH:MM
          const timeMatch = rawDate.match(/(\d+:\d+～\d+:\d+)/);
          const time = timeMatch ? timeMatch[1] : '';

          // 名前: th[scope="row"] 優先、なければ 2 番目セル
          const $nameCel = $row.find('th[scope="row"]').length
            ? $row.find('th[scope="row"]')
            : $cells.eq(1);
          const title = $nameCel.clone()
            .find('a:has(img), img').remove().end() // 画像リンク・画像を除去
            .text().replace(/\s+/g, ' ').trim();
          if (!title) return;

          // 場所: td.dline（Google Maps リンクを除く）または 3 番目セル
          const $placeCel = $row.find('td.dline').length
            ? $row.find('td.dline').first()
            : $cells.eq(2);
          const place = $placeCel.clone()
            .find('p.main__button--greenSigle, a').remove().end()
            .text().replace(/\s+/g, ' ').trim();

          events.push({
            id:             `ni-${dateStr.replace(/-/g, '')}-${titleHash(dateStr, title)}`,
            pref:           'niigata',
            date:           dateStr,
            weekday,
            title,
            place,
            address:        '',
            time,
            category:       guessCategory(toHalfWidth(title)) || category,
            tag:            guessTag(title),
            url:            '',
            notes:          null,
            ageRequirement: null,
            deadline:       null,
            imageUrl:       '',
          });
        });
      });
      $cur = $cur.next();
    }
  });

  // 重複除去 & 日付順ソート
  const seen = new Set();
  return events
    .filter(e => {
      const key = `${e.date}-${e.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

module.exports = { parseNiigata };
