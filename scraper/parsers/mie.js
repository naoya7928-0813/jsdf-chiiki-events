'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, reiwaToAD, padTwo } = require('./utils');

/**
 * 三重地本 WordPress 投稿ページのパーサー（1投稿 = 1イベント）
 *
 * 本文フォーマット例:
 *   ●イベント日時 ２０２６年５月２４日（土） １１：００～１２：００
 *   ●場所 自衛隊フリースペース 近鉄四日市駅北すぐ ...
 *   ●イベント内容 ...
 *
 * @param {import('cheerio').CheerioAPI} $ - 投稿ページの cheerio インスタンス
 * @param {string} url - 投稿ページの URL
 * @param {number} counter - ID 用カウンター
 * @returns {Array<Object>}
 */
function parseMiePost($, url, counter) {
  const content = $('main, .entry-content, .post-content, article').first();
  const bodyText = content.length
    ? content.text().replace(/\s+/g, ' ').trim()
    : $('body').text().replace(/\s+/g, ' ').trim();

  const halfBody = toHalfWidth(bodyText);

  // ── 日付抽出 ─────────────────────────────────────────────────
  const reiwaM = halfBody.match(/令和(\d+)年(\d+)月(\d+)日[（(]([月火水木金土日祝]+)[）)]/);
  const gregM  = halfBody.match(/(\d{4})年(\d+)月(\d+)日[（(]([月火水木金土日祝]+)[）)]/);
  const monthM = halfBody.match(/(\d+)月(\d+)日[（(]([月火水木金土日祝]+)[）)]/);

  let dateStr = '', weekday = '';
  if (reiwaM) {
    const y = reiwaToAD(parseInt(reiwaM[1], 10));
    dateStr = `${y}-${padTwo(parseInt(reiwaM[2], 10))}-${padTwo(parseInt(reiwaM[3], 10))}`;
    weekday = reiwaM[4];
  } else if (gregM) {
    dateStr = `${gregM[1]}-${padTwo(parseInt(gregM[2], 10))}-${padTwo(parseInt(gregM[3], 10))}`;
    weekday = gregM[4];
  } else if (monthM) {
    const now = new Date();
    const m = parseInt(monthM[1], 10), d = parseInt(monthM[2], 10);
    dateStr = `${now.getFullYear()}-${padTwo(m)}-${padTwo(d)}`;
    weekday = monthM[3];
  }

  if (dateStr && isPast(dateStr)) return [];

  // ── タイトル ─────────────────────────────────────────────────
  // 三重の投稿は h1 が常に「お知らせ」のため、本文先頭（YYYY.MM.DD の前）からイベント名を取る
  const bodyTitleM = halfBody.match(/^(.+?)\s+\d{4}\.\d{2}\.\d{2}/);
  const rawTitle = (bodyTitleM
    ? bodyTitleM[1].trim()
    : ($('h1.entry-title, h1.page-title, .entry-title, h1').first().text().trim()
       || $('title').text().replace(/\s*[–—-]\s*.*$/, '').trim()))
    .replace(/「|」/g, '').trim();
  if (!rawTitle || rawTitle === 'お知らせ') return [];

  // ── HTMLに日付なし → チラシ（PDF/画像）リンクにフォールバック ──
  if (!dateStr) {
    let flyerUrl = '';
    $('a[href]').each((_, a) => {
      const h = ($(a).attr('href') || '').trim();
      if (/\.pdf(\?.*)?$/i.test(h) && (h.startsWith('/') || h.includes('mod.go.jp'))) {
        flyerUrl = h.startsWith('http') ? h : `https://www.mod.go.jp${h.startsWith('/') ? '' : '/'}${h}`;
        return false;
      }
    });
    if (!flyerUrl) {
      $('img[src]').each((_, img) => {
        const s = ($(img).attr('src') || '').trim();
        if (/\.(jpe?g|png)(\?.*)?$/i.test(s) && /wp-content|uploads/i.test(s)
            && !/logo|header|nav|footer|icon/i.test(s)) {
          flyerUrl = s.startsWith('http') ? s : `https://www.mod.go.jp${s.startsWith('/') ? '' : '/'}${s}`;
          return false;
        }
      });
    }
    if (!flyerUrl) return [];
    return [{
      id: `mi-flyer-${counter}`, pref: 'mie', date: '', weekday: '',
      title: rawTitle.substring(0, 60), place: '', address: '', time: '',
      category: guessCategory(toHalfWidth(rawTitle)), tag: guessTag(rawTitle),
      url, notes: null, ageRequirement: null, deadline: null, imageUrl: '',
      _flyerUrl: flyerUrl,
    }];
  }

  // ── 場所 ─────────────────────────────────────────────────────
  const placeM = halfBody.match(/[●■]?場所\s+(.{2,60?})(?:\s+[●■]|イベント内容|日時|$)/);
  const place  = placeM ? placeM[1].trim().substring(0, 60) : '';

  // ── 時間 ─────────────────────────────────────────────────────
  const timeM = halfBody.match(/(\d+:\d+[～〜]\d+:\d+)/);
  const time  = timeM ? timeM[1] : '';

  return [{
    id:             `mi-${dateStr.replace(/-/g, '')}-${counter}`,
    pref:           'mie',
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
 * 三重地本イベント一覧ページから投稿 URL を抽出する。
 * @param {import('cheerio').CheerioAPI} $
 * @returns {string[]} 投稿 URL 配列
 */
function parseMiePostUrls($) {
  const urls = [];
  const seen = new Set();

  // /post-N 形式（WP自動ID）
  $('a[href*="mod.go.jp/pco/mie/post-"]').each((_, a) => {
    const href = $(a).attr('href') || '';
    if (href && !seen.has(href)) { seen.add(href); urls.push(href); }
  });

  // /events-page/[slug]/ 形式（親ページの子ページとして掲載する三重の形式）
  $('a[href*="mod.go.jp/pco/mie/events-page/"]').each((_, a) => {
    const href = $(a).attr('href') || '';
    // /events-page/ 自身は除外、子スラッグのみ
    if (href && !/\/events-page\/?$/.test(href) && !seen.has(href)) {
      seen.add(href); urls.push(href);
    }
  });

  return urls;
}

module.exports = { parseMiePost, parseMiePostUrls };
