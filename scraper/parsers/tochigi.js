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
    const raw = $('[href]').is(el)
      ? $(el).attr('href')
      : $(el).attr('src');
    if (!raw) return;
    if (!/\.jpe?g$/i.test(raw)) return;
    if (!/event\//i.test(raw)) return;
    const abs = resolveUrl(raw);
    if (abs && !seen.has(abs)) { seen.add(abs); urls.push(abs); }
  });

  return urls;
}

module.exports = { parseTochigiImages };
