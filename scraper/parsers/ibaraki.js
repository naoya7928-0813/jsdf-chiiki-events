'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, padTwo , titleHash } = require('./utils');

const BASE_URL = 'https://www.mod.go.jp/pco/ibaraki/event.html';

/** 令和年なしの「X月Y日」→ スクレイピング時の西暦を返す（過去日は isPast() で除外）*/
function inferYear() {
  return new Date().getFullYear();
}

/**
 * 茨城: div.post 内に h3（タイトル）+ h4（日時）+ p（場所・詳細）の平坦構造
 * 日付は「4月26日　日曜日　午前10時から午後3時」形式（令和年なし）
 *
 * @param {import('cheerio').CheerioAPI} $
 * @returns {Array<Object>}
 */
function parseIbaraki($) {
  const events = [];
  let idx = 0;

  // セクション見出しとして無視する h3 テキスト
  const SKIP = ['自衛隊イベント情報', '広報官がイベント会場にいます', '自衛官の採用試験について'];

  $('div.post h3').each((_i, h3El) => {
    const title = $(h3El).text().replace(/\s+/g, ' ').trim();
    if (!title || SKIP.some(s => title.includes(s))) return;

    // この h3 と次の h3 の間にある最初の h4 と p を収集
    let h4Text = '';
    let pText  = '';
    let $el    = $(h3El).next();

    while ($el.length && !$el.is('h3')) {
      if ($el.is('h4') && !h4Text) {
        h4Text = $el.text().replace(/\s+/g, ' ').trim();
      }
      if ($el.is('p') && !pText && !$el.find('img').length) {
        const t = $el.text().replace(/\s+/g, ' ').trim();
        if (t) pText = t;
      }
      $el = $el.next();
    }

    if (!h4Text) return;

    // 全角→半角、「日時：」プレフィックスを除去
    const raw = toHalfWidth(h4Text).replace(/^日時[：:]\s*/, '');

    // 月・日・曜日を抽出（令和年なし）
    const dtMatch = raw.match(/(\d+)月(\d+)日\s*([月火水木金土日])/);
    if (!dtMatch) return;

    const month   = parseInt(dtMatch[1], 10);
    const day     = parseInt(dtMatch[2], 10);
    const weekday = dtMatch[3];
    const year    = inferYear(month, day);
    const dateStr = `${year}-${padTwo(month)}-${padTwo(day)}`;
    if (isPast(dateStr)) return;

    // 時間: 曜日 のあとの部分（「午前10時から午後3時」等）
    const timeMatch = raw.match(/曜日\s*(.*)/);
    const time = timeMatch ? timeMatch[1].trim() : '';

    // 場所: p テキストから「場所：〇〇」または「場所は〇〇にて」を抽出
    const placeMatch = pText.match(/場所[：:は]?\s*([^。。\n<]+)/);
    const place = placeMatch
      ? placeMatch[1].replace(/にて.*|まで.*|<br>.*/, '').trim()
      : '';

    events.push({
      id:             `ib-${dateStr.replace(/-/g, '')}-${titleHash(dateStr, title)}`,
      pref:           'ibaraki',
      date:           dateStr,
      weekday,
      title,
      place,
      address:        '',
      time,
      category:       guessCategory(toHalfWidth(title)),
      tag:            guessTag(title),
      url:            '',
      notes:          pText || null,
      ageRequirement: null,
      deadline:       null,
      imageUrl:       '',
    });
  });

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

module.exports = { parseIbaraki };
