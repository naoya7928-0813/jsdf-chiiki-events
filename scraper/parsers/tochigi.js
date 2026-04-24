'use strict';

const BASE_URL = 'https://www.mod.go.jp/pco/tochigi/';

function resolveUrl(href) {
  if (!href) return '';
  if (href.startsWith('http')) return href;
  try { return new URL(href, BASE_URL).href; } catch { return ''; }
}

/**
 * 栃木地本はイベントをJPG画像で掲示する。
 * ページ内の event/*.jpg リンクを収集して返す（OCR は index.js 側で実施）。
 *
 * @param {import('cheerio').CheerioAPI} $
 * @returns {string[]} 画像の絶対URL配列
 */
function parseTochigiImages($) {
  const seen = new Set();
  const urls = [];

  // <a href="...event/...jpg"> と <img src="...event/...jpg"> を両方探す
  $('a[href], img[src]').each((_i, el) => {
    const href = $(el).attr('href');
    const src  = $(el).attr('src');

    for (const raw of [href, src]) {
      if (!raw) continue;
      if (!/\.jpe?g$/i.test(raw)) continue;
      if (!/event\//i.test(raw)) continue;
      // パス内に event/ があってもファイル名自体に "event" を含む場合のみ対象
      // （例: event/LRT_banner.jpg は除外、event/8.4.16event.jpg は対象）
      const filename = raw.split('/').pop() || '';
      if (!/event/i.test(filename)) continue;
      const abs = resolveUrl(raw);
      if (abs && !seen.has(abs)) { seen.add(abs); urls.push(abs); }
    }
  });

  return urls;
}

module.exports = { parseTochigiImages };
