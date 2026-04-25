'use strict';

/**
 * 兵庫地本 TOP ページからイベントバナー画像 URL を抽出する。
 * 栃木・富山と同じく OCR 方式（index.js 内で ocrImageFull を呼ぶ）。
 *
 * @param {import('cheerio').CheerioAPI} $
 * @returns {string[]} 画像 URL 配列
 */
function parseHyogoImages($) {
  const BASE = 'https://www.mod.go.jp/pco/hyogo/';
  const EXCLUDE = /logo|nav|menu|slider|footer|header|sp[/_]|icon|\.png.*X|WEBmanual|kazokukai|recruit[0-9]/i;
  const EVENT   = /setumeikai|banner|event|fes|festival|kengaku|ensou|concert/i;

  const urls = [];

  $('img').each((_, img) => {
    const src = $(img).attr('src') || '';
    if (!src) return;
    if (EXCLUDE.test(src)) return;
    if (!EVENT.test(src) && !/\d{4}/.test(src)) return; // 日付数字またはイベントキーワードがある画像のみ

    const full = src.startsWith('http') ? src : `${BASE}${src}`;
    if (!urls.includes(full)) urls.push(full);
  });

  return urls;
}

module.exports = { parseHyogoImages };
