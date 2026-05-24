'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, padTwo , titleHash } = require('./utils');

/**
 * 青森地本トップページパーサー
 * URL: https://www.mod.go.jp/pco/aomori/
 *
 * TOP ページのイベントは PDF へのリンクテキストに日付・タイトルが含まれる:
 *   <a href="event/20260330.pdf">2026.6.19(金)・6.21(日) 自衛隊音楽隊合同演奏会</a>
 *
 * @param {import('cheerio').CheerioAPI} $
 * @returns {Array<Object>}
 */
function parseAomori($) {
  const events = [];
  let idx = 0;

  $('a').each((_i, a) => {
    const href = $(a).attr('href') || '';
    // event/ 配下の PDF または HTML ファイルへのリンクを対象
    if (!/event\//i.test(href)) return;
    if (/manga|coramu/i.test(href)) return; // マンガ・コラム系除外

    const rawText = toHalfWidth($(a).text().replace(/\s+/g, ' ').trim());
    if (!rawText) return;

    // "2026.6.19(金)" または "2026.6.19(金)・6.21(日)" を先頭から抽出
    const dateMatch = rawText.match(/^(\d{4})\.(\d+)\.(\d+)\s*[（(]([月火水木金土日祝]+)[）)]/);
    if (!dateMatch) return;

    const year    = parseInt(dateMatch[1], 10);
    const month   = parseInt(dateMatch[2], 10);
    const day     = parseInt(dateMatch[3], 10);
    const weekday = dateMatch[4];
    const dateStr = `${year}-${padTwo(month)}-${padTwo(day)}`;
    if (isPast(dateStr)) return;

    // タイトル: 日付部分（範囲含む）を除去した残り
    const title = rawText
      .replace(/^\d{4}\.\d+\.\d+[（(][月火水木金土日祝]+[）)][・\s]*(?:\d+\.\d+[（(][月火水木金土日祝]+[）)])?[・\s]*/, '')
      .trim();
    if (!title) return;

    const pdfUrl = href.startsWith('http')
      ? href
      : `https://www.mod.go.jp/pco/aomori/${href}`;

    events.push({
      id:             `ao-${dateStr.replace(/-/g, '')}-${titleHash(dateStr, title)}`,
      pref:           'aomori',
      date:           dateStr,
      weekday,
      title,
      place:          '',
      address:        '',
      time:           '',
      category:       guessCategory(title),
      tag:            guessTag(title),
      url:            pdfUrl,
      notes:          null,
      ageRequirement: null,
      deadline:       null,
      imageUrl:       '',
    });
  });

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

module.exports = { parseAomori };
