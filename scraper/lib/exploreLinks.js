'use strict';

const { normalizeUrl } = require('./normalizeUrl');

// イベント・フライヤー系ページを示すキーワード（URLパス or リンクテキスト）
const EVENT_URL_KW = /event|oshirase|news|topics|bosyu|chirashi|annai|setsumei|recruit|koho|kiji|post|saiyou|announce|info|schedule|calendar/i;
const EVENT_TXT_KW = /イベント|行事|お知らせ|新着|募集案内|チラシ|説明会|公開|記念行事|体験|見学|催し|情報|スケジュール|案内|広報/;

// アクセス・組織情報系ページ（スキップ対象）
const SKIP_URL_KW = /contact|access|jimusyo|about|privacy|sitemap|staff|history|link|mail|recruit_top|gaiyou|rinen|nenpou|map/i;

/**
 * ページ内から「イベント情報系サブページ」へのリンクを抽出する。
 * 同一 mod.go.jp/pco ドメイン内のリンクのみ対象。
 *
 * @param {import('cheerio').CheerioAPI} $
 * @param {string} pageUrl - 現在のページURL
 * @param {Set<string>} visited - 訪問済み or 既スクレイプ対象のURL（重複除去用）
 * @returns {Array<{url: string, text: string}>}
 */
function findEventLinks($, pageUrl, visited = new Set()) {
  const seen  = new Set();
  const links = [];

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    const norm = normalizeUrl(href, pageUrl);
    if (!norm) return;
    if (!norm.includes('mod.go.jp/pco')) return;
    if (seen.has(norm) || visited.has(norm)) return;
    if (SKIP_URL_KW.test(norm)) return;
    if (!EVENT_URL_KW.test(norm) && !EVENT_TXT_KW.test(text)) return;
    seen.add(norm);
    links.push({ url: norm, text: text.slice(0, 80) });
  });

  return links;
}

module.exports = { findEventLinks };
