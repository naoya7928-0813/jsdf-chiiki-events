'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, reiwaToAD, padTwo , titleHash } = require('./utils');

/** MM月DD日 → ISO date（過去の月日は null を返してスキップ）*/
function inferDate(month, day) {
  const now  = new Date();
  const nowM = now.getMonth() + 1;
  const nowD = now.getDate();
  const year = now.getFullYear();
  // 月が過去、または同月で日が過去 → 終了済みイベントとして除外
  if (month < nowM || (month === nowM && day < nowD)) return null;
  return `${year}-${padTwo(month)}-${padTwo(day)}`;
}

/**
 * 岐阜地本イベントページのパーサー
 *
 * 構造: h2（月名または "近郊イベント"）+ table
 *   列: 日時 / イベント名(th[scope="row"]) / 場所 / 備考
 *   日付は全角数字 "４月１１日（土）" 形式
 *
 * @param {import('cheerio').CheerioAPI} $
 * @returns {Array<Object>}
 */
function parseGifu($) {
  const events = [];
  let idx = 0;

  $('h2').each((_i, h2el) => {
    const h2text = $(h2el).text().replace(/\s+/g, ' ').trim();
    // 月別イベント or 近郊イベント のみ対象
    if (!/月イベント情報|近郊自衛隊イベント/.test(h2text)) return;

    // 次の table を探す（最大 5 要素先まで）
    let $next = $(h2el).next();
    let $tbl  = null;
    for (let k = 0; k < 5 && $next.length; k++) {
      if ($next.is('table')) { $tbl = $next; break; }
      const found = $next.find('table');
      if (found.length) { $tbl = found.first(); break; }
      $next = $next.next();
    }
    if (!$tbl) return;

    $tbl.find('tbody tr').each((_k, row) => {
      const $row   = $(row);
      const $cells = $row.children('td, th');
      if ($cells.length < 2) return;

      const rawDate = toHalfWidth($cells.eq(0).text().replace(/\s+/g, ' ').trim());

      // MM月DD日（曜日）
      const dateMatch = rawDate.match(/(\d+)月(\d+)日[（(]([月火水木金土日祝]+)[）)]/);
      // 令和Y年M月D日（曜日）
      const reiwaMatch = rawDate.match(/令和(\d+)年(\d+)月(\d+)日[（(]([月火水木金土日祝]+)[）)]/);

      let dateStr, weekday;
      if (reiwaMatch) {
        const year = reiwaToAD(parseInt(reiwaMatch[1], 10));
        dateStr  = `${year}-${padTwo(parseInt(reiwaMatch[2], 10))}-${padTwo(parseInt(reiwaMatch[3], 10))}`;
        weekday  = reiwaMatch[4];
      } else if (dateMatch) {
        const month = parseInt(dateMatch[1], 10);
        const day   = parseInt(dateMatch[2], 10);
        dateStr  = inferDate(month, day);
        weekday  = dateMatch[3];
      } else {
        return; // 日付なし（継続・ツアー行）はスキップ
      }
      if (!dateStr || isPast(dateStr)) return;

      // 時間
      const timeMatch = rawDate.match(/(\d+:\d+～\d+:\d+)/);
      const time = timeMatch ? timeMatch[1] : '';

      // 名前: th[scope="row"] 優先
      const $nameCel = $row.find('th[scope="row"]').length
        ? $row.find('th[scope="row"]')
        : $cells.eq(1);
      const title = $nameCel.clone()
        .find('a').each((_l, a) => $(a).replaceWith($(a).text())).end()
        .text().replace(/\s+/g, ' ').trim();
      if (!title) return;

      // 場所: 3 列目（th[scope] の次の td）
      let $placeCel = $cells.eq(2);
      if ($placeCel.is('th')) $placeCel = $cells.eq(3); // th が 2 列続く場合
      const place = $placeCel.clone()
        .find('br').replaceWith(' ').end()
        .text().replace(/\s+/g, ' ').trim();

      events.push({
        id:             `gi-${dateStr.replace(/-/g, '')}-${titleHash(dateStr, title)}`,
        pref:           'gifu',
        date:           dateStr,
        weekday,
        title,
        place,
        address:        '',
        time,
        category:       guessCategory(toHalfWidth(title)),
        tag:            guessTag(title),
        url:            '',
        notes:          null,
        ageRequirement: null,
        deadline:       null,
        imageUrl:       '',
      });
    });
  });

  // 重複除去 & 日付順
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

module.exports = { parseGifu };
