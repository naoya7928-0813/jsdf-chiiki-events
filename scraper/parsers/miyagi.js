'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, padTwo , titleHash } = require('./utils');

// 本物のトップページ（/pco/miyagi/ はここへの転送用ページ）。ページ内の相対リンクの基準
const PAGE_URL = 'https://www.mod.go.jp/pco/miyagi/miyagitop/index.html';

/**
 * 宮城地本トップページパーサー
 * URL: https://www.mod.go.jp/pco/miyagi/miyagitop/index.html
 *
 * TOP ページの「EVENT新着イベント」セクション構造:
 *   <div id="toppage-news">
 *     <dl>
 *       <dt>NEWS 2026.4.25</dt><dd><a href="...">タイトル</a></dd>
 *       ...
 *     </dl>
 *   </div>
 *
 * /pco/miyagi/ は中身の無い転送用ページ（<meta refresh>）で、本物のトップは miyagitop/index.html。
 * イベント一覧（miyagitop/event.html）は案内所巡回（office-event-sources.json）が読むため、ここはトップの新着欄だけ。
 *
 * @param {import('cheerio').CheerioAPI} $
 * @returns {Array<Object>}
 */
function parseMiyagi($) {
  const events = [];
  let idx = 0;

  // 「新着イベント EVENT」見出しの直後の dl > dt/dd ペアだけを読む。
  // 同じ id="toppage-news" の枠に「お知らせ NEWS」（更新履歴）もあり、日付の形が同じなので見出しで区別する。
  const $eventHeads = $('h3').filter((_i, h3) => {
    const t = $(h3).text().replace(/\s+/g, '');
    return /新着イベント|EVENT/i.test(t) && !/お知らせ/.test(t);
  });
  const $dts = $eventHeads.length
    ? $eventHeads.nextUntil('h3', 'dl').find('dt')
    : $('#toppage-news dl dt');

  $dts.each((_i, dt) => {
    const dtText = toHalfWidth($(dt).text().replace(/\s+/g, ' ').trim());
    // "2026.10.31" / "2026.4.25-26"（2026-10 までは先頭に "NEWS " が付いていた）
    const dateMatch = dtText.match(/^(?:NEWS\s+)?(\d{4})\.(\d+)\.(\d+)(?:\s*[-～~]\s*(?:(\d+)\.)?(\d+))?/);
    if (!dateMatch) return;

    const year  = parseInt(dateMatch[1], 10);
    const month = parseInt(dateMatch[2], 10);
    const day   = parseInt(dateMatch[3], 10);
    const dateStr = `${year}-${padTwo(month)}-${padTwo(day)}`;
    let endDate = null;
    if (dateMatch[5]) {
      const endMonth = dateMatch[4] ? parseInt(dateMatch[4], 10) : month;
      const endYear  = endMonth < month ? year + 1 : year;
      const e = `${endYear}-${padTwo(endMonth)}-${padTwo(parseInt(dateMatch[5], 10))}`;
      if (e > dateStr) endDate = e;
    }
    if (isPast(endDate || dateStr)) return;

    // 同じ dl 内の dd: 1つ目=イベント名 / 💡アイコン=内容 / 【会場】=会場 / 最後=担当事務所
    const $dds   = $(dt).nextUntil('dt', 'dd');
    let place = '';
    let notes = null;
    $dds.each((_j, ddEl) => {
      const t = $(ddEl).text().replace(/\s+/g, ' ').trim();
      const venue = t.match(/【会場】\s*(.+)/);
      if (venue && !place) place = venue[1].replace(/[\s　]+$/, '').trim();
      else if ($(ddEl).find('img[src*="icon_light"]').length && !notes) notes = t || null;
    });

    const $dd    = $(dt).next('dd');
    const $a     = $dd.find('a');
    const title  = toHalfWidth(($a.length ? $a : $dd).text().replace(/\s+/g, ' ').trim());
    if (!title) return;

    const rawUrl = $a.attr('href') || '';
    // ページ内のリンクは本物のトップ（miyagitop/index.html）からの相対。
    // 以前は /pco/miyagi/ を基準にして「/pco/miyagi/event.html」（存在しない）を作り、404 として空にしていた
    let url = '';
    if (rawUrl) {
      try { url = new URL(rawUrl, PAGE_URL).href; } catch { url = ''; }
    }

    const d = new Date(dateStr + 'T00:00:00');
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const weekday  = weekdays[d.getDay()] || '';

    events.push({
      id:             `mi-${dateStr.replace(/-/g, '')}-${titleHash(dateStr, title)}`,
      pref:           'miyagi',
      date:           dateStr,
      weekday,
      ...(endDate ? { endDate } : {}),
      title,
      place,
      address:        '',
      time:           '',
      category:       guessCategory(title),
      tag:            guessTag(title),
      url,
      notes,
      ageRequirement: null,
      deadline:       null,
      imageUrl:       '',
    });
  });

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

module.exports = { parseMiyagi };
