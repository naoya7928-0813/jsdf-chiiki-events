'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, padTwo } = require('./utils');

const AICHI_BASE = 'https://www.mod.go.jp/pco/aichi/';

/**
 * 愛知地本カレンダーページのパーサー（calendar.html）
 *
 * 構造: #calendarTrack > .calendar-slide（月ごと）
 *   .calendar-title → "2026年 4月"
 *   .calendar-day   → 1 日ぶん
 *     .day-col      → "4 (土)" (日付 + 曜日)
 *     .event-item   → イベント 1 件
 *       .event-label → 種別ラベル
 *       .event-link  → イベント名（<i> タグを除く）、href が詳細ページ
 *
 * @param {import('cheerio').CheerioAPI} $
 * @returns {Array<{id,pref,date,weekday,title,place,address,time,category,tag,url,notes,ageRequirement,deadline,endDate}>}
 */
function parseAichi($) {
  const events = [];
  let idx = 0;

  $('.calendar-slide').each((_i, slideEl) => {
    const monthText  = $(slideEl).find('.calendar-title').text().replace(/\s+/g, ' ').trim();
    const monthMatch = monthText.match(/(\d{4})年\s*(\d+)月/);
    if (!monthMatch) return;

    const year  = parseInt(monthMatch[1], 10);
    const month = parseInt(monthMatch[2], 10);

    $(slideEl).find('.calendar-day').each((_j, dayEl) => {
      const dayText  = $(dayEl).find('.day-col').text().replace(/\s+/g, ' ').trim();
      const dayMatch = dayText.match(/(\d+)\s*[（(]([月火水木金土日])[）)]/);
      if (!dayMatch) return;

      const day     = parseInt(dayMatch[1], 10);
      const weekday = dayMatch[2];
      const dateStr = `${year}-${padTwo(month)}-${padTwo(day)}`;
      if (isPast(dateStr)) return;

      $(dayEl).find('.event-item').each((_k, itemEl) => {
        const $link = $(itemEl).find('.event-link');

        const title = $link.clone()
          .find('i').remove().end()
          .text().replace(/\s+/g, ' ').trim();
        if (!title) return;

        // 詳細ページ URL（相対パスを絶対パスへ）
        const href = $link.attr('href') || '';
        const url  = href
          ? (href.startsWith('http') ? href : AICHI_BASE + href.replace(/^\.?\//, ''))
          : '';

        const typeLabel = $(itemEl).find('.event-label').text().replace(/\s+/g, ' ').trim();

        // カレンダーページに場所情報はないため空文字（詳細ページ取得は fetchAichiDetail で実施）
        events.push({
          id:             `ai-${dateStr.replace(/-/g, '')}-${titleHash(dateStr, title)}`,
          pref:           'aichi',
          date:           dateStr,
          weekday,
          title,
          place:          '',
          address:        '',
          time:           '',
          category:       guessCategory(toHalfWidth(title)) || '説明会',
          tag:            guessTag(title),
          url,
          notes:          typeLabel || null,
          ageRequirement: null,
          deadline:       null,
          endDate:        null,
        });
      });
    });
  });

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 愛知地本イベント詳細ページから place を抽出する
 * 詳細ページ構造（mod.go.jp 共通パターン）:
 *   - table の th に「場所」「会場」「開催場所」などを含む行 → 隣の td が場所
 *   - .event-place, .place, #place などのクラス/ID
 *   - dl > dt「場所」 → dd
 *
 * @param {import('cheerio').CheerioAPI} $
 * @returns {{ place: string, address: string, time: string }}
 */
function parseAichiDetail($) {
  // 1) テーブルの th → td パターン（「場所」「会場」「開催場所」）
  let place = '';
  let time  = '';

  $('table tr').each((_i, row) => {
    const th = $(row).find('th').text().replace(/\s+/g, '').trim();
    const td = $(row).find('td').text().replace(/\s+/g, ' ').trim();
    if (!place && /場所|会場|開催場所/.test(th)) place = td;
    if (!time  && /時間|時刻|開催時間/.test(th))  time  = td;
  });

  // 2) dl > dt/dd パターン
  if (!place) {
    $('dl').each((_i, dl) => {
      $(dl).find('dt').each((_j, dt) => {
        if (/場所|会場/.test($(dt).text())) {
          place = $(dt).next('dd').text().replace(/\s+/g, ' ').trim();
        }
        if (!time && /時間|時刻/.test($(dt).text())) {
          time = $(dt).next('dd').text().replace(/\s+/g, ' ').trim();
        }
      });
    });
  }

  // 3) クラス名パターン
  if (!place) place = $('.event-place, .place, #place').first().text().replace(/\s+/g, ' ').trim();
  if (!time)  time  = $('.event-time,  .time,  #time' ).first().text().replace(/\s+/g, ' ').trim();

  return { place, address: '', time };
}

module.exports = { parseAichi, parseAichiDetail };
