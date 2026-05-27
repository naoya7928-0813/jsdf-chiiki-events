'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, reiwaToAD, padTwo } = require('./utils');

/**
 * 滋賀地本 WordPress 投稿ページのパーサー（1投稿 = 1イベント）
 *
 * @param {import('cheerio').CheerioAPI} $
 * @param {string} url
 * @param {number} counter
 * @returns {Array<Object>}
 */
function parseShigaPost($, url, counter) {
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
  const rawTitle = ($('h1.entry-title, h1.page-title, .entry-title, h1').first().text().trim()
    || $('title').text().replace(/\s*[–—-]\s*.*$/, '').trim())
    .replace(/「|」/g, '').trim();
  if (!rawTitle) return [];

  // ── HTMLに日付なし → チラシ（PDF/画像）リンクにフォールバック ──
  if (!dateStr) {
    let flyerUrl = '';
    $('a[href]').each((_, a) => {
      const h = ($(a).attr('href') || '').trim();
      if (/\.pdf(\?.*)?$/i.test(h) && h.includes('mod.go.jp')) {
        flyerUrl = h; return false;
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
      id: `sh-flyer-${counter}`, pref: 'shiga', date: '', weekday: '',
      title: rawTitle.substring(0, 60), place: '', address: '', time: '',
      category: guessCategory(toHalfWidth(rawTitle)), tag: guessTag(rawTitle),
      url, notes: null, ageRequirement: null, deadline: null, imageUrl: '',
      _flyerUrl: flyerUrl,
    }];
  }

  // ── 場所 ─────────────────────────────────────────────────────
  const placeM = halfBody.match(/(?:場所|会場|開催場所)[：: ]\s*(.{2,60?})(?:\s+(?:日時|内容|対象|締切|[●■])|$)/);
  const place  = placeM ? placeM[1].trim().substring(0, 60) : '';

  // ── 時間 ─────────────────────────────────────────────────────
  const timeM = halfBody.match(/(\d+:\d+[～〜]\d+:\d+)/);
  const time  = timeM ? timeM[1] : '';

  return [{
    id:             `sh-${dateStr.replace(/-/g, '')}-${counter}`,
    pref:           'shiga',
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
 * 滋賀地本イベント一覧ページから投稿 URL を抽出する。
 */
function parseShigaPostUrls($) {
  const urls = [];
  $('a[href*="mod.go.jp/pco/shiga/"]').each((_, a) => {
    const href = $(a).attr('href') || '';
    if (/\/post-\d+\//.test(href) && !urls.includes(href)) urls.push(href);
    if (/\/event\/event-\d+\//.test(href) && !urls.includes(href)) urls.push(href);
  });
  return urls;
}

module.exports = { parseShigaPost, parseShigaPostUrls };
