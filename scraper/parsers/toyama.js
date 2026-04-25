'use strict';

const BASE_URL = 'https://www.mod.go.jp/pco/toyama/content/04-event/';

function resolveUrl(href) {
  if (!href) return '';
  if (href.startsWith('http')) return href;
  try { return new URL(href, BASE_URL).href; } catch { return ''; }
}

/**
 * 富山地本はイベントを JPG 画像で掲示する。
 * ページ内の .jpg リンク・img を収集して返す（OCR は index.js 側で実施）。
 *
 * @param {import('cheerio').CheerioAPI} $
 * @returns {string[]} 画像の絶対 URL 配列
 */
function parseToyamaImages($) {
  const seen = new Set();
  const urls = [];

  $('a[href], img[src]').each((_i, el) => {
    const href = $(el).attr('href');
    const src  = $(el).attr('src');

    for (const raw of [href, src]) {
      if (!raw) continue;
      if (!/\.jpe?g$/i.test(raw)) continue;
      const abs = resolveUrl(raw);
      if (abs && !seen.has(abs)) { seen.add(abs); urls.push(abs); }
    }
  });

  return urls;
}

module.exports = { parseToyamaImages };
