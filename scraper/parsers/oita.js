'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, reiwaToAD, padTwo, titleHash } = require('./utils');

const URL_OITA = 'https://www.mod.go.jp/pco/oita/03_event.html';

/**
 * 大分地本イベントページパーサー（WordPress SWELL）
 * 構造: <h3>イベントタイトル</h3>
 *        <p>...<b>【日時】</b><br>８月２日(土)<br>10:00～12:30<br>
 *           <b>【会場】</b><br>会場名<br>...</p>
 * 日付は全角数字（toHalfWidthで変換）、年号なし → 当年使用
 */
function parseOita($) {
  const events = [];
  const now = new Date();

  $('h2, h3').each((_, heading) => {
    const tag      = (heading.tagName || '').toLowerCase();
    const rawTitle = toHalfWidth($(heading).text().trim().replace(/\s+/g, ' '));

    // ページタイトルや大見出しを除外
    if (!rawTitle || rawTitle.length < 3) return;
    if (/イベント情報|お知らせ|大分地本|自衛隊|ページ|メニュー/.test(rawTitle)) return;
    // 【 】囲みの見出し（大分特有）を整形
    const title = rawTitle.replace(/^【|】$/g, '').trim();
    if (!title) return;

    // h3 直後から次の h2/h3 まで テキストを収集
    let searchText = '';
    $(heading).nextUntil('h2, h3').each((_, el) => {
      searchText += ' ' + toHalfWidth($(el).text());
    });

    let dateStr = '', weekday = '', place = '', time = '';

    const rM = searchText.match(/令和(\d+)年(\d+)月(\d+)日[（(]([月火水木金土日祝]+)[）)]/);
    const gM = searchText.match(/(\d+)月(\d+)日[（(]([月火水木金土日祝]+)[）)]/);

    if (rM) {
      dateStr = `${reiwaToAD(parseInt(rM[1], 10))}-${padTwo(parseInt(rM[2], 10))}-${padTwo(parseInt(rM[3], 10))}`;
      weekday = rM[4];
    } else if (gM) {
      const month = parseInt(gM[1], 10);
      const day   = parseInt(gM[2], 10);
      weekday = gM[3];
      // 当年固定、isPastで過去日を除外
      dateStr = `${now.getFullYear()}-${padTwo(month)}-${padTwo(day)}`;
    }

    if (!dateStr || isPast(dateStr)) return;

    // 時刻
    const tM = searchText.match(/(\d+:\d+)[～〜～](\d+:\d+)/);
    if (tM) time = `${tM[1]}～${tM[2]}`;

    // 会場
    const placeM = searchText.match(/【会場】\s*([^【\n（(]{2,40})/);
    if (placeM) place = placeM[1].trim().substring(0, 60);

    events.push({
      id:             `oi-${dateStr.replace(/-/g, '')}-${titleHash(dateStr, title.substring(0, 60))}`,
      pref:           'oita',
      date:           dateStr,
      weekday,
      title:          title.substring(0, 60),
      place,
      address:        '',
      time,
      category:       guessCategory(title),
      tag:            guessTag(title),
      url:            URL_OITA,
      notes:          null,
      ageRequirement: null,
      deadline:       null,
      imageUrl:       '',
    });
  });

  return events;
}

module.exports = { parseOita };
