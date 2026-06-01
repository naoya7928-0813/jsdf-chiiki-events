'use strict';

const { normalizeUrl, isPdfUrl, isImageUrl, isAssetUrl } = require('./normalizeUrl');

/**
 * Cheerio DOM からPDF・画像URLを抽出して返す。
 * a[href], img[src], source[srcset] を対象とする。
 *
 * @param {import('cheerio').CheerioAPI} $
 * @param {string} pageUrl - ページのURL（相対URL解決・正規化の基底）
 * @returns {Array<{url:string, normalized:string, type:'pdf'|'image', linkText:string, sourcePageUrl:string}>}
 */
function extractAssets($, pageUrl) {
  const seen   = new Set();
  const assets = [];

  function add(rawUrl, linkText = '') {
    const norm = normalizeUrl(rawUrl, pageUrl);
    if (!norm) return;
    if (!isAssetUrl(norm)) return;
    if (seen.has(norm)) return;
    seen.add(norm);

    let absUrl;
    try {
      absUrl = new URL(rawUrl, pageUrl).href;
    } catch {
      return;
    }

    assets.push({
      url:           absUrl,
      normalized:    norm,
      type:          isPdfUrl(norm) ? 'pdf' : 'image',
      linkText:      (linkText || '').replace(/\s+/g, ' ').trim().slice(0, 120),
      sourcePageUrl: pageUrl,
    });
  }

  // a[href]
  $('a[href]').each((_, el) => {
    add($(el).attr('href') || '', $(el).text());
  });

  // img[src]
  $('img[src]').each((_, el) => {
    const alt = $(el).attr('alt') || $(el).closest('a').text() || '';
    add($(el).attr('src') || '', alt);
  });

  // source[srcset]
  $('source[srcset]').each((_, el) => {
    const srcset = $(el).attr('srcset') || '';
    for (const part of srcset.split(',')) {
      const url = part.trim().split(/\s+/)[0];
      if (url) add(url);
    }
  });

  return assets;
}

module.exports = { extractAssets };
