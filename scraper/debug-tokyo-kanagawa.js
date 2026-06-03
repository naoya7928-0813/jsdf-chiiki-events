#!/usr/bin/env node
'use strict';
/**
 * 東京・神奈川地本の全事務所ページを網羅的に調査するデバッグスクリプト
 * 実行: cd scraper && node debug-tokyo-kanagawa.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const cheerio = require('cheerio');
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const BETWEEN_MS = 5000;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function createCtx(browser) {
  return browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'ja-JP',
    extraHTTPHeaders: { 'Accept-Language': 'ja,en;q=0.9' },
  });
}

async function fetchPage(browser, url) {
  const ctx  = await createCtx(browser);
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const html = await page.content();
    return cheerio.load(html);
  } catch (e) {
    console.warn(`  [ERR] ${url}: ${e.message.slice(0,80)}`);
    return null;
  } finally {
    await ctx.close();
  }
}

// イベント・PDF・画像リンクを抽出
function extractLinks($, baseUrl) {
  const links = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().replace(/\s+/g,' ').trim();
    if (!href || href.startsWith('#') || href.startsWith('javascript')) return;
    let abs;
    try { abs = new URL(href, baseUrl).href; } catch { return; }
    if (!abs.includes('mod.go.jp/pco')) return;
    links.push({ url: abs, text: text.slice(0,60), isPdf: /\.pdf/i.test(abs) });
  });
  return links;
}

// キーワード判定
const EVENT_KW = /event|oshirase|news|topics|bosyu|setsumei|seikatsu|saiyou|annai|schedule|calendar|info|recruit|koho|kiji/i;
const EVENT_TXT = /イベント|行事|お知らせ|説明会|採用|募集案内|チラシ|公開|体験|見学|スケジュール|案内|広報/;
const SKIP_KW  = /contact|access|privacy|sitemap|staff|history|link|mail|gaiyou|rinen|nenpou|map|engo|nyuusatu|chotatsu|kanri/i;

async function exploreSite(browser, hqUrl, label) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[${label}] トップページ: ${hqUrl}`);
  console.log('='.repeat(60));

  const $ = await fetchPage(browser, hqUrl);
  if (!$) return;

  const allLinks = extractLinks($, hqUrl);

  // イベント系・PDF・事務所ページを抽出
  const eventPages = [];
  const pdfLinks   = [];

  allLinks.forEach(l => {
    if (l.isPdf) { pdfLinks.push(l); return; }
    if (SKIP_KW.test(l.url)) return;
    if (EVENT_KW.test(l.url) || EVENT_TXT.test(l.text)) {
      eventPages.push(l);
    }
  });

  console.log(`\nトップページのリンク総数: ${allLinks.length}`);
  console.log(`イベント系ページ候補: ${eventPages.length}件`);
  console.log(`PDFリンク: ${pdfLinks.length}件`);

  if (pdfLinks.length > 0) {
    console.log('\n📄 PDFリンク:');
    pdfLinks.forEach(l => console.log(`  [PDF] "${l.text}" → ${l.url}`));
  }

  if (eventPages.length > 0) {
    console.log('\n🔗 イベント系ページ候補:');
    eventPages.forEach(l => console.log(`  "${l.text}" → ${l.url}`));
  }

  // 各イベントページを深掘り
  const visited = new Set([hqUrl]);
  for (const link of eventPages.slice(0, 10)) {
    if (visited.has(link.url)) continue;
    visited.add(link.url);

    await sleep(BETWEEN_MS);
    console.log(`\n  ▶ ${link.url}`);
    const $sub = await fetchPage(browser, link.url);
    if (!$sub) continue;

    const title = $sub('title').text().trim();
    const subLinks = extractLinks($sub, link.url);
    const subPdfs  = subLinks.filter(l => l.isPdf);
    const subEvts  = subLinks.filter(l => !l.isPdf && (EVENT_KW.test(l.url) || EVENT_TXT.test(l.text)) && !SKIP_KW.test(l.url));

    // テキストから日付っぽいものを探す
    const bodyText = $sub('body').text().replace(/\s+/g,' ').slice(0, 2000);
    const dateMatches = bodyText.match(/令和\d+年\d+月\d+日|R\d+\.\d+\.\d+|\d{4}年\d+月\d+日|\d+月\d+日[（(][月火水木金土日]/g) || [];
    const uniqueDates = [...new Set(dateMatches)].slice(0,5);

    console.log(`    タイトル: ${title}`);
    if (uniqueDates.length > 0) console.log(`    日付候補: ${uniqueDates.join(' / ')}`);
    if (subPdfs.length > 0)  console.log(`    PDF: ${subPdfs.length}件 → ${subPdfs.slice(0,3).map(l=>l.text||l.url.split('/').pop()).join(', ')}`);
    if (subEvts.length > 0)  console.log(`    サブリンク: ${subEvts.length}件 → ${subEvts.slice(0,3).map(l=>l.text).join(', ')}`);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    await exploreSite(browser, 'https://www.mod.go.jp/pco/tokyo/', '東京地本');
    await sleep(BETWEEN_MS);
    await exploreSite(browser, 'https://www.mod.go.jp/pco/kanagawa/', '神奈川地本');
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
