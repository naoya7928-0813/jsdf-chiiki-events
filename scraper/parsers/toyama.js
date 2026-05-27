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
/**
 * 除外すべきテンプレート/ロゴ画像パターン:
 *   - /images/logo*.jpg, logo*.JPG  → サイトヘッダーロゴ
 *   - img-top*.jpg                  → ページ上部装飾画像
 *   - ivento.jpg                    → セクションヘッダー固定画像
 *   - /images/top.png               → トップ装飾
 * イベントポスターは通常 /content/04-event/ 配下のイベント固有ファイル名を持つ。
 */
const TOYAMA_EXCLUDE = /\/images\/logo|img-top\d*\.|ivento\.jpg|\/images\/top\.|logo\d+\.(jpg|JPG)/i;

function parseToyamaImages($) {
  const seen = new Set();
  const urls = [];

  $('a[href], img[src]').each((_i, el) => {
    const href = $(el).attr('href');
    const src  = $(el).attr('src');

    for (const raw of [href, src]) {
      if (!raw) continue;
      if (!/\.jpe?g$/i.test(raw)) continue;
      if (TOYAMA_EXCLUDE.test(raw)) continue;   // テンプレート画像を除外
      const abs = resolveUrl(raw);
      if (abs && !seen.has(abs)) { seen.add(abs); urls.push(abs); }
    }
  });

  return urls;
}

module.exports = { parseToyamaImages };
