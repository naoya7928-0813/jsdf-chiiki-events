'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, reiwaToAD, padTwo , titleHash } = require('./utils');

/**
 * 山梨地本イベントページのパーサー
 *
 * 構造: .event_block ごとに 1 件
 *   .event_thumb > img  → サムネイル
 *   .event_text > h3    → イベント名
 *   .event_text > p     → 日付・場所などのテキスト（イベント掲載時）
 *
 * 現在「準備中」表示のみのためページ構造は暫定。
 * 実際のイベントが掲載された際の想定構造を基に実装。
 *
 * @param {import('cheerio').CheerioAPI} $
 * @returns {Array<Object>}
 */
function parseYamanashi($) {
  const events = [];
  let idx = 0;

  $('.event_block').each((_i, el) => {
    const $el  = $(el);
    const title = $el.find('.event_text h3').text().replace(/\s+/g, ' ').trim();

    // "準備中" や空のブロックはスキップ
    if (!title || title === '準備中') return;

    // p テキストから日付・場所を抽出（掲載時の想定）
    const paras = $el.find('.event_text p').toArray()
      .map(p => $(p).text().replace(/\s+/g, ' ').trim())
      .filter(Boolean);

    let dateStr = '';
    let weekday = '';
    let place   = '';
    let time    = '';

    for (const para of paras) {
      const raw = toHalfWidth(para);

      // 令和Y年M月D日（曜日）
      const reiwaMatch = raw.match(/令和(\d+)年(\d+)月(\d+)日[（(]([月火水木金土日祝]+)[）)]/);
      if (reiwaMatch && !dateStr) {
        const year = reiwaToAD(parseInt(reiwaMatch[1], 10));
        dateStr  = `${year}-${padTwo(parseInt(reiwaMatch[2], 10))}-${padTwo(parseInt(reiwaMatch[3], 10))}`;
        weekday  = reiwaMatch[4];
      }

      // YYYY/M/D（曜日）or YYYY年M月D日
      const gregMatch = raw.match(/(\d{4})[\/年](\d{1,2})[\/月](\d{1,2})[日]?[（(]([月火水木金土日祝]+)[）)]/);
      if (gregMatch && !dateStr) {
        dateStr = `${gregMatch[1]}-${padTwo(parseInt(gregMatch[2], 10))}-${padTwo(parseInt(gregMatch[3], 10))}`;
        weekday = gregMatch[4];
      }

      // 時間
      const timeMatch = raw.match(/(\d+:\d+～\d+:\d+)/);
      if (timeMatch && !time) time = timeMatch[1];

      // 場所（"場所：..." or "会場：..."）
      const placeMatch = raw.match(/(?:場所|会場)[：:]\s*(.+)/);
      if (placeMatch && !place) place = placeMatch[1].trim();
    }

    if (!dateStr) return; // 日付不明はスキップ
    if (isPast(dateStr)) return;

    events.push({
      id:             `ya-${dateStr.replace(/-/g, '')}-${titleHash(dateStr, title)}`,
      pref:           'yamanashi',
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

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

module.exports = { parseYamanashi };
