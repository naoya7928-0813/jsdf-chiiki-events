'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, padTwo } = require('./utils');

const URL_TOKUSHIMA = 'https://www.mod.go.jp/pco/tokushima/event.html';

/**
 * 徳島地本イベントページパーサー
 * 構造: 月ごとのセクション（"04月" "03月" などの月見出し）
 *       各イベント: "DD (曜) タイトル" の後に 【場　所】【時　間】テーブル
 * body テキストを月単位で分割してイベントを抽出する
 */
function parseTokushima($) {
  const events = [];
  const now    = new Date();

  // main コンテンツを取得（ナビゲーションを除外するため main/section を優先）
  const mainEl = $('main, #main, .main').first();
  const rawText = toHalfWidth(
    (mainEl.length ? mainEl : $('body')).text()
  ).replace(/\s+/g, ' ').trim();

  // "(\d{1,2})月" で月セクションを分割
  // 例: "... 04月 対象のイベントはございません。 03月 07 (土) ..." → ['...', '4', '対象...', '3', '07 (土)...']
  const parts = rawText.split(/(?<!\d)(\d{1,2})月(?!\d)/);

  for (let i = 1; i < parts.length; i += 2) {
    const month   = parseInt(parts[i], 10);
    if (month < 1 || month > 12) continue;

    const section = parts[i + 1] || '';
    if (/対象のイベントはございません/.test(section)) continue;

    // このページは当年1月〜の記録ページなので常に現在年を使い isPast に委ねる
    const year = now.getFullYear();

    // イベントの開始パターン: "DD （曜） or DD (曜)" を区切りとして分割
    const blocks = section.split(/(?=\d+\s*[（(][月火水木金土日祝]+[）)])/);

    for (const block of blocks) {
      const dayM = block.match(/^(\d+)\s*[（(]([月火水木金土日祝]+)[）)]/);
      if (!dayM) continue;

      const day     = parseInt(dayM[1], 10);
      if (day < 1 || day > 31) continue;
      const weekday = dayM[2];

      // タイトル: 曜日の後から 【場　所】 の前まで
      const afterDay = block.slice(block.indexOf(dayM[0]) + dayM[0].length).trim();
      const placeIdx = afterDay.indexOf('【場');
      const title    = (placeIdx > 0 ? afterDay.substring(0, placeIdx) : afterDay.split(/【/)[0])
        .trim().replace(/\s+/g, ' ');
      if (!title) continue;

      // 場所
      const placeM = block.match(/【場\s*所】\s*([^【]+)/);
      const place  = placeM ? placeM[1].trim().substring(0, 60) : '';

      // 時間
      const timeM = block.match(/【時\s*間】\s*([^【]+)/);
      const time  = timeM ? timeM[1].trim().substring(0, 20) : '';

      const dateStr = `${year}-${padTwo(month)}-${padTwo(day)}`;
      if (isPast(dateStr)) continue;

      events.push({
        id:             `tk-${dateStr.replace(/-/g, '')}-${events.length + 1}`,
        pref:           'tokushima',
        date:           dateStr,
        weekday,
        title:          title.substring(0, 60),
        place,
        address:        '',
        time,
        category:       guessCategory(title),
        tag:            guessTag(title),
        url:            URL_TOKUSHIMA,
        notes:          null,
        ageRequirement: null,
        deadline:       null,
        imageUrl:       '',
      });
    }
  }

  return events;
}

module.exports = { parseTokushima };
