'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, padTwo } = require('./utils');

/** MM月DD日 → ISO date（年はスクレイピング時の西暦を使用、過去日は isPast() で除外）*/
function inferDate(month, day) {
  return `${new Date().getFullYear()}-${padTwo(month)}-${padTwo(day)}`;
}

/**
 * 帯広地本イベントページのパーサー
 * URL: https://www.mod.go.jp/pco/obihiro/topics_event.html
 *
 * 構造: #col_main 内の複数セクション、各セクションにtable
 *   広報ブース・各種行事テーブル列: 地域 | 開催日時 | イベント名 | 開催場所 | お問合せ先
 *   陸上自衛隊テーブル列:          ポスター | 開催日時 | イベント名 | 開催場所 | お問合せ先
 *
 * 日付形式: "MM月DD日（曜日）\nHH:MM～HH:MM" （全角数字）
 *
 * @param {import('cheerio').CheerioAPI} $
 * @returns {Array<Object>}
 */
function parseObihiro($) {
  const events = [];
  let idx = 0;

  $('#col_main table, .conteiner table').each((_i, tbl) => {
    $(tbl).find('tbody tr').each((_j, row) => {
      const $row   = $(row);
      const $cells = $row.children('td, th');
      if ($cells.length < 3) return;

      // 最初のtdが「地域」テキストのみ（見出し行）はスキップ
      const firstText = $cells.eq(0).text().replace(/\s+/g, '').trim();
      if (['地域', 'ポスター', '開催日時', '日時'].includes(firstText)) return;

      // 日付候補: td[0](地域/ポスター) or td[1](開催日時)
      // td[1] に日付らしいテキストがあれば優先
      let rawDate = '';
      let titleIdx = 2;
      let placeIdx = 3;

      const td1 = toHalfWidth($cells.eq(1).text().replace(/\s+/g, ' ').trim());
      const td0 = toHalfWidth($cells.eq(0).text().replace(/\s+/g, ' ').trim());

      if (/\d+月\d+日/.test(td1)) {
        rawDate  = td1;
        titleIdx = 2;
        placeIdx = 3;
      } else if (/\d+月\d+日/.test(td0)) {
        rawDate  = td0;
        titleIdx = 1;
        placeIdx = 2;
      } else {
        return;
      }

      const dateMatch = rawDate.match(/(\d+)月(\d+)日[（(]([月火水木金土日祝]+)[）)]/);
      if (!dateMatch) return;

      const month   = parseInt(dateMatch[1], 10);
      const day     = parseInt(dateMatch[2], 10);
      const weekday = dateMatch[3];
      const dateStr = inferDate(month, day);
      if (isPast(dateStr)) return;

      // 時間
      const timeMatch = rawDate.match(/(\d+:\d+[～〜]\d+:\d+)/);
      const time = timeMatch ? timeMatch[1] : '';

      // タイトル
      const title = $cells.eq(titleIdx).clone()
        .find('a').each((_k, a) => $(a).replaceWith($(a).text())).end()
        .find('img').remove().end()
        .text().replace(/\s+/g, ' ').trim();
      if (!title || title === '現在公開予定はありません。') return;

      // 場所
      const place = $cells.eq(placeIdx).clone()
        .find('br').replaceWith(' ').end()
        .text().replace(/\s+/g, ' ').trim();

      events.push({
        id:             `ob-${dateStr.replace(/-/g, '')}-${titleHash(dateStr, title)}`,
        pref:           'obihiro',
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

module.exports = { parseObihiro };
