'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, padTwo, titleHash } = require('./utils');

const URL_FUKUOKA = 'https://www.mod.go.jp/pco/fukuoka/event/index.html';

/**
 * 福岡地本イベントページパーサー（佐賀と同テンプレート）
 * 構造: <section><h3 class="headLine03">タイトル</h3>
 *        <table class="comTableA"><th>開催日時</th><td>YYYY年M月D日（曜）HH:MM～HH:MM</td>
 *                                  <th>場所</th><td>...</td></table></section>
 */
function parseFukuoka($) {
  const events = [];

  $('section').each((_, sec) => {
    const rawTitle = toHalfWidth($(sec).find('h3').first().text().trim().replace(/\s+/g, ' '));
    if (!rawTitle || rawTitle.length < 3) return;
    if (/ナビゲーション|メニュー|フッター/.test(rawTitle)) return;

    let dateStr = '', weekday = '', place = '', time = '';

    $(sec).find('table tr').each((_, tr) => {
      const thText = toHalfWidth($(tr).find('th').text()).replace(/\s+/g, '');
      const tdText = toHalfWidth($(tr).find('td').text().trim());

      if (/開催日時|日時/.test(thText)) {
        const m = tdText.match(/(\d{4})年(\d+)月(\d+)日[（(]([月火水木金土日祝]+)[）)]/);
        if (m) {
          dateStr = `${m[1]}-${padTwo(parseInt(m[2], 10))}-${padTwo(parseInt(m[3], 10))}`;
          weekday = m[4];
          const tM = tdText.match(/(\d+:\d+)[～〜～](\d+:\d+)/);
          if (tM) time = `${tM[1]}～${tM[2]}`;
        }
      }
      if (/場所/.test(thText) && !place) {
        place = tdText.split(/[（(（\n]/)[0].trim().substring(0, 60);
      }
    });

    if (!dateStr || isPast(dateStr)) return;

    events.push({
      id:             `fk-${dateStr.replace(/-/g, '')}-${titleHash(dateStr, rawTitle.substring(0, 60))}`,
      pref:           'fukuoka',
      date:           dateStr,
      weekday,
      title:          rawTitle.substring(0, 60),
      place,
      address:        '',
      time,
      category:       guessCategory(rawTitle),
      tag:            guessTag(rawTitle),
      url:            URL_FUKUOKA,
      notes:          null,
      ageRequirement: null,
      deadline:       null,
      imageUrl:       '',
    });
  });

  return events;
}

module.exports = { parseFukuoka };
