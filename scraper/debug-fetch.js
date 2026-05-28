#!/usr/bin/env node
'use strict';

/**
 * Actionsと同じheaderでページ内容を取得し、パーサーのデバッグをする
 */

const cheerio = require('cheerio');
const { parseNaraPost, parseNaraPostUrls } = require('./parsers/nara');
const { parseShigaPost, parseShigaPostUrls } = require('./parsers/shiga');
const { parseMiePost, parseMiePostUrls } = require('./parsers/mie');
const { parseWakayamaPost, parseWakayamaPostUrls } = require('./parsers/wakayama');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
  'Referer': 'https://www.mod.go.jp/',
};

async function tryFetch(url) {
  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) { console.log(`HTTP ${res.status} for ${url}`); return null; }
    return await res.text();
  } catch (e) {
    console.log(`fetch error for ${url}: ${e.message}`);
    return null;
  }
}

async function inspectPost(url, postFn, label) {
  console.log(`\n--- [${label}] ${url} ---`);
  const html = await tryFetch(url);
  if (!html) { console.log('取得失敗'); return; }

  const $ = cheerio.load(html, { decodeEntities: false });
  const title = $('title').text();
  const h1 = $('h1').first().text().trim();
  console.log(`title: "${title}"`);
  console.log(`h1: "${h1}"`);

  const body = $('main, .entry-content, .post-content, article, .content').first().text().replace(/\s+/g, ' ').trim();
  console.log(`body(300): "${body.substring(0, 300)}"`);

  // PDF リンク
  const pdfs = [];
  $('a[href]').each((_, a) => {
    const h = $(a).attr('href') || '';
    if (/\.pdf/i.test(h)) pdfs.push(h);
  });
  console.log(`PDFs: ${pdfs.join(', ') || 'なし'}`);

  // 全画像
  const imgs = [];
  $('img[src]').each((_, el) => imgs.push($(el).attr('src')));
  console.log(`imgs: ${imgs.join(', ') || 'なし'}`);

  // 全a[href] に画像があるか
  const imgHrefs = [];
  $('a[href]').each((_, a) => {
    const h = $(a).attr('href') || '';
    if (/\.(jpe?g|png|gif|webp)/i.test(h)) imgHrefs.push(h);
  });
  console.log(`img hrefs: ${imgHrefs.join(', ') || 'なし'}`);

  const evs = postFn($, url, 1);
  console.log(`parser: ${evs.length} 件`, JSON.stringify(evs.map(e => ({ date: e.date, title: e.title, _flyerUrl: e._flyerUrl }))));
}

async function inspectList(listUrl, urlsFn, postFn, label) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[${label}] 一覧: ${listUrl}`);
  const html = await tryFetch(listUrl);
  if (!html) { console.log('一覧取得失敗'); return; }

  const $ = cheerio.load(html, { decodeEntities: false });
  const urls = urlsFn($);
  console.log(`投稿URL: ${urls.join(', ')}`);

  for (const u of urls.slice(0, 3)) {
    await inspectPost(u, postFn, label);
    await new Promise(r => setTimeout(r, 1000));
  }
}

async function main() {
  await inspectList('https://www.mod.go.jp/pco/nara/events/', parseNaraPostUrls, parseNaraPost, '奈良');
  await inspectList('https://www.mod.go.jp/pco/shiga/event-briefing/', parseShigaPostUrls, parseShigaPost, '滋賀');
  await inspectList('https://www.mod.go.jp/pco/mie/events-page/', parseMiePostUrls, parseMiePost, '三重');
  await inspectList('https://www.mod.go.jp/pco/wakayama/category/event/', parseWakayamaPostUrls, parseWakayamaPost, '和歌山');
}

main().catch(console.error);
