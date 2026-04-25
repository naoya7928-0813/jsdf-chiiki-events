'use strict';

const { parseICalEvents } = require('./nagano');

/**
 * 秋田地本イベントパーサー（Google Calendar iCal）
 * URL: https://www.mod.go.jp/pco/akita/asset/event/index.html
 *
 * Google Calendar 2つを統合:
 *   3n2esbei0vm8qte2chsohavldc@group.calendar.google.com
 *   fnqjg3qoglr6iorbinvgjban7k@group.calendar.google.com
 *
 * @param {string} icsText1 - 1つ目のカレンダーiCal テキスト
 * @param {string} [icsText2=''] - 2つ目のカレンダーiCal テキスト
 * @returns {Array<Object>}
 */
function parseAkita(icsText1, icsText2 = '') {
  const ev1 = parseICalEvents(icsText1, 'akita');
  const ev2 = icsText2 ? parseICalEvents(icsText2, 'akita') : [];

  // 重複除去（同日同タイトル）
  const seen = new Set();
  return [...ev1, ...ev2]
    .filter(e => {
      const key = `${e.date}-${e.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

module.exports = { parseAkita };
