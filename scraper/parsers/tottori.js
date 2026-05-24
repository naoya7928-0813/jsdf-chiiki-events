'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, reiwaToAD, padTwo, titleHash } = require('./utils');

const URL_TOTTORI = 'https://www.mod.go.jp/pco/tottori/content/02-event/event.html';

/**
 * 鳥取地本イベントページパーサー
 * 構造: 画像+自由テキスト形式（テーブルなし）
 * h2/h3/h4 見出しをイベント名とし、直後テキストから日付・場所を抽出
 * 日付パターン: "令和X年Y月Z日（曜）" or "Y月Z日（曜）"
 */
function parseTottori($) {
  const events = [];
  const now = new Date();

  // 見出し要素 + その直後のテキストブロックを走査
  $('h2, h3, h4').each((_, heading) => {
    const rawTitle = toHalfWidth($(heading).text().trim().replace(/\s+/g, ' '));
    // ナビゲーション・ページタイトル等を除外
    if (!rawTitle || rawTitle.length < 4) return;
    if (/メニュー|ナビ|ページ|トップ|サイト|検索|リンク|お知らせ|採用|自衛隊|地本|お問合|フッター/.test(rawTitle)) return;

    // 直後の兄弟テキスト（p, div, li）を収集して日付を探す
    let searchText = '';
    $(heading).nextAll('p, div, li, td').slice(0, 5).each((_, el) => {
      searchText += ' ' + toHalfWidth($(el).text());
    });
    // 見出し自体にも日付が含まれることがある
    searchText = rawTitle + ' ' + searchText;

    let dateStr = '', weekday = '', place = '';

    // 令和X年Y月Z日（曜）
    const rM = searchText.match(/令和(\d+)年(\d+)月(\d+)日[（(]([月火水木金土日祝]+)[）)]/);
    // Y月Z日（曜）
    const gM = searchText.match(/(\d+)月(\d+)日[（(]([月火水木金土日祝]+)[）)]/);

    if (rM) {
      dateStr = `${reiwaToAD(parseInt(rM[1], 10))}-${padTwo(parseInt(rM[2], 10))}-${padTwo(parseInt(rM[3], 10))}`;
      weekday = rM[4];
    } else if (gM) {
      const month = parseInt(gM[1], 10);
      const day   = parseInt(gM[2], 10);
      weekday     = gM[3];
      dateStr = `${now.getFullYear()}-${padTwo(month)}-${padTwo(day)}`;
    }

    if (!dateStr || isPast(dateStr)) return;

    // 場所: "場所：xxx" or "会場：xxx"
    const placeM = searchText.match(/(?:場所|会場)[：:]\s*([^。\n（(]{2,30})/);
    if (placeM) place = placeM[1].trim().substring(0, 60);

    events.push({
      id:             `tt-${dateStr.replace(/-/g, '')}-${titleHash(dateStr, rawTitle.substring(0, 60))}`,
      pref:           'tottori',
      date:           dateStr,
      weekday,
      title:          rawTitle.substring(0, 60),
      place,
      address:        '',
      time:           '',
      category:       guessCategory(rawTitle),
      tag:            guessTag(rawTitle),
      url:            URL_TOTTORI,
      notes:          null,
      ageRequirement: null,
      deadline:       null,
      imageUrl:       '',
    });
  });

  return events;
}

module.exports = { parseTottori };
