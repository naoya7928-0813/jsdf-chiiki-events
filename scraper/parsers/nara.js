'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, reiwaToAD, padTwo } = require('./utils');

/**
 * 奈良地本 WordPress 投稿ページのパーサー（1投稿 = 1イベント）
 *
 * 投稿内テーブル形式例:
 *   応募条件 | ...
 *   申込期限 | 令和８年５月１１日（月）正午まで
 *   ...
 *
 * @param {import('cheerio').CheerioAPI} $
 * @param {string} url
 * @param {number} counter
 * @returns {Array<Object>}
 */
function parseNaraPost($, url, counter) {
  const content = $('main, .entry-content, .post-content, article, .page-content').first();
  const bodyText = content.length
    ? content.text().replace(/\s+/g, ' ').trim()
    : $('body').text().replace(/\s+/g, ' ').trim();

  const halfBody = toHalfWidth(bodyText);

  // ── 日付抽出（テーブル row の中から日時・開催日を優先検索） ──
  // テーブルの「日時」「開催日」「実施日」セルから抽出
  let dateStr = '', weekday = '', place = '', time = '';

  $('table tr').each((_, tr) => {
    const cells = $(tr).find('td,th');
    if (cells.length < 2) return;
    const label = cells.first().text().trim().replace(/\s+/g, '');
    const value = toHalfWidth(cells.eq(1).text().trim().replace(/\s+/g, ' '));

    if (!dateStr && /^(日時|開催日|実施日|日程)/.test(label)) {
      const rM = value.match(/令和(\d+)年(\d+)月(\d+)日[（(]([月火水木金土日祝]+)[）)]/);
      const gM = value.match(/(\d{4})年(\d+)月(\d+)日[（(]([月火水木金土日祝]+)[）)]/);
      const mM = value.match(/(\d+)月(\d+)日[（(]([月火水木金土日祝]+)[）)]/);
      if (rM) {
        const y = reiwaToAD(parseInt(rM[1], 10));
        dateStr = `${y}-${padTwo(parseInt(rM[2], 10))}-${padTwo(parseInt(rM[3], 10))}`;
        weekday = rM[4];
      } else if (gM) {
        dateStr = `${gM[1]}-${padTwo(parseInt(gM[2], 10))}-${padTwo(parseInt(gM[3], 10))}`;
        weekday = gM[4];
      } else if (mM) {
        const now = new Date();
        const m = parseInt(mM[1], 10), d = parseInt(mM[2], 10);
        const inFut = m > now.getMonth() + 1 || (m === now.getMonth() + 1 && d >= now.getDate());
        dateStr = `${inFut ? now.getFullYear() : now.getFullYear() + 1}-${padTwo(m)}-${padTwo(d)}`;
        weekday = mM[3];
      }
      const tM = value.match(/(\d+:\d+[～〜]\d+:\d+)/);
      if (tM) time = tM[1];
    }

    if (!place && /^場所|^会場/.test(label)) {
      place = value.split(/[（(]/)[0].trim().substring(0, 60);
    }
  });

  // テーブルから取れなかった場合、本文から日付を探す
  if (!dateStr) {
    const rM = halfBody.match(/令和(\d+)年(\d+)月(\d+)日[（(]([月火水木金土日祝]+)[）)]/);
    const gM = halfBody.match(/(\d{4})年(\d+)月(\d+)日[（(]([月火水木金土日祝]+)[）)]/);
    const mM = halfBody.match(/(\d+)月(\d+)日[（(]([月火水木金土日祝]+)[）)]/);
    if (rM) {
      const y = reiwaToAD(parseInt(rM[1], 10));
      dateStr = `${y}-${padTwo(parseInt(rM[2], 10))}-${padTwo(parseInt(rM[3], 10))}`;
      weekday = rM[4];
    } else if (gM) {
      dateStr = `${gM[1]}-${padTwo(parseInt(gM[2], 10))}-${padTwo(parseInt(gM[3], 10))}`;
      weekday = gM[4];
    } else if (mM) {
      const now = new Date();
      const m = parseInt(mM[1], 10), d = parseInt(mM[2], 10);
      const inFut = m > now.getMonth() + 1 || (m === now.getMonth() + 1 && d >= now.getDate());
      dateStr = `${inFut ? now.getFullYear() : now.getFullYear() + 1}-${padTwo(m)}-${padTwo(d)}`;
      weekday = mM[3];
    }
  }

  if (!dateStr || isPast(dateStr)) return [];

  // ── タイトル ─────────────────────────────────────────────────
  const rawTitle = ($('h1.entry-title, h1.page-title, .entry-title, h1').first().text().trim()
    || $('title').text().replace(/\s*[-–—].*$/, '').trim())
    .replace(/[「」]|掲載しました。?/g, '').trim();
  if (!rawTitle) return [];

  return [{
    id:             `na-${dateStr.replace(/-/g, '')}-${counter}`,
    pref:           'nara',
    date:           dateStr,
    weekday,
    title:          rawTitle.substring(0, 60),
    place,
    address:        '',
    time,
    category:       guessCategory(toHalfWidth(rawTitle)),
    tag:            guessTag(rawTitle),
    url,
    notes:          null,
    ageRequirement: null,
    deadline:       null,
    imageUrl:       '',
  }];
}

/**
 * 奈良地本イベント一覧ページから投稿 URL を抽出する。
 */
function parseNaraPostUrls($) {
  const urls = [];
  $('a[href*="mod.go.jp/pco/nara/post-"]').each((_, a) => {
    const href = $(a).attr('href') || '';
    if (href && !urls.includes(href)) urls.push(href);
  });
  return urls;
}

module.exports = { parseNaraPost, parseNaraPostUrls };
