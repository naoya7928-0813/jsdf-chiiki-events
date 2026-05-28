#!/usr/bin/env node
'use strict';

/**
 * 近畿WP系地本・富山のページ構造を診断するデバッグスクリプト
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const cheerio = require('cheerio');
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const { parseMiePostUrls, parseMiePost }           = require('./parsers/mie');
const { parseShigaPostUrls, parseShigaPost }       = require('./parsers/shiga');
const { parseNaraPostUrls, parseNaraPost }         = require('./parsers/nara');
const { parseWakayamaPostUrls, parseWakayamaPost } = require('./parsers/wakayama');
const { parseToyamaImages }                        = require('./parsers/toyama');

const URLS = {
  mie:      'https://www.mod.go.jp/pco/mie/events-page/',
  shiga:    'https://www.mod.go.jp/pco/shiga/event-briefing/',
  nara:     'https://www.mod.go.jp/pco/nara/events/',
  wakayama: 'https://www.mod.go.jp/pco/wakayama/category/event/',
  toyama:   'https://www.mod.go.jp/pco/toyama/content/04-event/04-event.html',
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchPage(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  try {
    await page.waitForFunction(
      () => { const t = document.title; return t.length > 0 && !t.includes('Just a moment') && !t.includes('しばらくお待ちください'); },
      { timeout: 30_000 }
    );
  } catch {}
  await page.waitForTimeout(2000);
  return await page.content();
}

async function inspect(browser, label, listUrl, urlsFn, postFn) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[${label}] 一覧: ${listUrl}`);

  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'ja-JP',
  });
  ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  });

  const listPage = await ctx.newPage();
  let postUrls = [];
  try {
    const html = await fetchPage(listPage, listUrl);
    const $ = cheerio.load(html, { decodeEntities: false });
    postUrls = [...new Set(urlsFn($))];
    console.log(`  投稿URL ${postUrls.length} 件:`, postUrls);
  } finally {
    await listPage.close();
  }

  for (const url of postUrls.slice(0, 3)) {
    const postPage = await ctx.newPage();
    try {
      console.log(`\n  [投稿] ${url}`);
      const html = await fetchPage(postPage, url);
      const $ = cheerio.load(html, { decodeEntities: false });

      // タイトル
      const h1 = $('h1.entry-title, h1.page-title, .entry-title, h1').first().text().trim();
      console.log(`    h1: "${h1}"`);

      // 本文先頭
      const body = $('main, .entry-content, .post-content, article, .content').first().text().replace(/\s+/g, ' ').trim().substring(0, 200);
      console.log(`    body(200): "${body}"`);

      // PDF リンク
      const pdfLinks = [];
      $('a[href]').each((_, a) => {
        const h = $(a).attr('href') || '';
        if (/\.pdf/i.test(h)) pdfLinks.push(h);
      });
      console.log(`    PDF links: ${pdfLinks.length > 0 ? pdfLinks.join(', ') : 'なし'}`);

      // 画像 (uploads/wp-content)
      const imgs = [];
      $('img[src]').each((_, img) => {
        const s = $(img).attr('src') || '';
        if (/\.(jpe?g|png)/i.test(s)) imgs.push(s);
      });
      console.log(`    images: ${imgs.slice(0, 5).join(', ') || 'なし'}`);

      // パーサー結果
      const evs = postFn($, url, 1);
      console.log(`    parser result: ${evs.length} 件`, JSON.stringify(evs.map(e => ({ date: e.date, title: e.title?.substring(0,30), _flyerUrl: e._flyerUrl }))));

    } catch (err) {
      console.warn(`    エラー: ${err.message}`);
    } finally {
      await postPage.close();
    }
    await sleep(1500);
  }

  await ctx.close();
}

async function inspectToyama(browser) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[富山] ${URLS.toyama}`);

  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'ja-JP',
  });
  ctx.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });

  const page = await ctx.newPage();
  try {
    const html = await fetchPage(page, URLS.toyama);
    const $ = cheerio.load(html, { decodeEntities: false });
    const imgs = parseToyamaImages($);
    console.log(`  収集画像 ${imgs.length} 件:`);
    imgs.forEach(u => console.log(`    ${u}`));

    // ページ内の全リンクも確認
    console.log('\n  全a[href] (jpg/png/pdf):');
    $('a[href]').each((_, a) => {
      const h = $(a).attr('href') || '';
      if (/\.(jpe?g|png|pdf)/i.test(h)) console.log(`    ${h}`);
    });

    // img タグも全部
    console.log('\n  全img[src]:');
    $('img[src]').each((_, img) => {
      const s = $(img).attr('src') || '';
      console.log(`    ${s}`);
    });

  } finally {
    await page.close();
    await ctx.close();
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    await inspect(browser, '三重',   URLS.mie,      parseMiePostUrls,      parseMiePost);
    await inspect(browser, '滋賀',   URLS.shiga,    parseShigaPostUrls,    parseShigaPost);
    await inspect(browser, '奈良',   URLS.nara,     parseNaraPostUrls,     parseNaraPost);
    await inspect(browser, '和歌山', URLS.wakayama, parseWakayamaPostUrls, parseWakayamaPost);
    await inspectToyama(browser);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
