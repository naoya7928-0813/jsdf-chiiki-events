'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, padTwo } = require('./utils');

/** MM月DD日 → ISO date（年はスクレイピング時の西暦を使用、過去日は isPast() で除外）*/
function inferDate(month, day) {
  return `${new Date().getFullYear()}-${padTwo(month)}-${padTwo(day)}`;
}

/**
 * 旭川地本イベントページのパーサー
 * URL: https://www.mod.go.jp/pco/asahikawa/event.html
 *
 * 構造: table > tbody > tr（3列: 日時 | 内容 | 備考）
 *   備考列に "終了" が含まれる行はスキップ
 *   日付: "MM月DD日（曜日）HH:MM～HH:MM" 形式（全角）
 *
 * @param {import('cheerio').CheerioAPI} $
 * @returns {Array<Object>}
 */
function parseAsahikawa($) {
  const events = [];
  let idx = 0;

  $('table tbody tr').each((_i, row) => {
    const $row   = $(row);
    const $cells = $row.children('td, th');
    if ($cells.length < 2) return;

    // 備考列に "終了" があればスキップ
    const bikoText = $cells.eq(2).text();
    if (bikoText.includes('終了')) return;

    const rawDate = toHalfWidth($cells.eq(0).text().replace(/\s+/g, ' ').trim());

    // MM月DD日（曜日）
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

    // タイトル: td[1]（<a>リンクを含む場合あり）
    const title = $cells.eq(1).clone()
      .find('a').each((_k, a) => $(a).replaceWith($(a).text())).end()
      .find('img').remove().end()
      .text().replace(/\s+/g, ' ').trim();
    if (!title) return;

    events.push({
      id:             `ak-${dateStr.replace(/-/g, '')}-${++idx}`,
      pref:           'asahikawa',
      date:           dateStr,
      weekday,
      title,
      place:          '',
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

module.exports = { parseAsahikawa };
