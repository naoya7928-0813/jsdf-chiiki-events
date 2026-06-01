'use strict';

const { normalizeUrl, isPdfUrl, isImageUrl, isAssetUrl } = require('./normalizeUrl');

// イベント・フライヤー系ページを示すキーワード（URLパス or リンクテキスト）
const EVENT_URL_KW = /event|oshirase|news|topics|bosyu|chirashi|annai|setsumei|recruit|koho|kiji|post|saiyou|announce|info|schedule|calendar/i;
const EVENT_TXT_KW = /イベント|行事|お知らせ|新着|募集案内|チラシ|説明会|公開|記念行事|体験|見学|催し|情報|スケジュール|案内|広報/;

// アクセス・組織情報系ページ（スキップ対象）
const SKIP_URL_KW = /contact|access|jimusyo|about|privacy|sitemap|staff|history|link|mail|recruit_top|gaiyou|rinen|nenpou|map/i;

/**
 * ページ内のリンクを2種類に分類して返す。
 *  - pages: イベント情報系 HTML サブページ（Playwrightで取得してから資産抽出）
 *  - assets: PDF/画像の直接リンク（downloadFile → OCR で直接処理）
 *
 * @param {import('cheerio').CheerioAPI} $
 * @param {string} pageUrl
 * @param {Set<string>} visited - 訪問済み/既スクレイプ対象URL
 * @returns {{ pages: Array<{url,text}>, assets: Array<{url,text,type}> }}
 */
function findEventLinks($, pageUrl, visited = new Set()) {
  const seenPages  = new Set();
  const seenAssets = new Set();
  const pages  = [];
  const assets = [];

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    const norm = normalizeUrl(href, pageUrl);
    if (!norm) return;
    if (!norm.includes('mod.go.jp/pco')) return;
    if (visited.has(norm)) return;

    // PDF/画像リンク → assets として直接OCR対象にする
    if (isAssetUrl(norm)) {
      if (seenAssets.has(norm)) return;
      // イベント系キーワードを含むもの or 説明会・体験・採用 系ファイル名のみ
      if (!EVENT_URL_KW.test(norm) && !EVENT_TXT_KW.test(text)) return;
      seenAssets.add(norm);
      assets.push({
        url:      norm,
        text:     text.slice(0, 80),
        type:     isPdfUrl(norm) ? 'pdf' : 'image',
        sourcePageUrl: pageUrl,
      });
      return;
    }

    // HTML ページ → event系キーワードがあるものを探索対象にする
    if (seenPages.has(norm)) return;
    if (SKIP_URL_KW.test(norm)) return;
    if (!EVENT_URL_KW.test(norm) && !EVENT_TXT_KW.test(text)) return;
    seenPages.add(norm);
    pages.push({ url: norm, text: text.slice(0, 80) });
  });

  return { pages, assets };
}

module.exports = { findEventLinks };
