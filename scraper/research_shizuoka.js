#!/usr/bin/env node
'use strict';

const cheerio = require('cheerio');
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-infobars', '--disable-blink-features=AutomationControlled', '--lang=ja-JP'],
  });
  const ctx = await browser.newContext({
    userAgent:  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale:     'ja-JP',
    timezoneId: 'Asia/Tokyo',
  });
  const page = await ctx.newPage();

  const url = 'https://www.mod.go.jp/pco/sizuoka/event/index.html';
  console.log('URL:', url);

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  try {
    await page.waitForFunction(
      () => { const t = document.title; return t.length > 0 && !t.includes('Just a moment') && !t.includes('しばらくお待ちください'); },
      { timeout: 60_000 }
    );
  } catch {}
  await page.waitForTimeout(2000);

  const html  = await page.content();
  const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '';
  console.log('title:', title.trim().substring(0, 70));

  const $ = cheerio.load(html, { decodeEntities: false });
  const clean = s => (s || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // セレクタ確認
  const sels = [
    'table', 'dl', 'article', '.event', 'div[class*="event"]',
    'div[class*="cal"]', '.calendar', '.schedule', 'section[id]',
    '.fc-event', 'ul li', 'h2', 'h3', 'h4',
  ];
  console.log('\n--- セレクタ ---');
  sels.forEach(s => { const n = $(s).length; if (n) console.log(`  ${s}: ${n}`); });

  // h2〜h4テキスト
  const txts = (sel, n) => $(sel).slice(0, n).toArray()
    .map(el => $(el).text().replace(/\s+/g, ' ').trim().substring(0, 80))
    .filter(Boolean);
  console.log('\nh2:', JSON.stringify(txts('h2', 5)));
  console.log('h3:', JSON.stringify(txts('h3', 5)));
  console.log('h4:', JSON.stringify(txts('h4', 5)));

  // 日付パターン
  const bodyText = $('body').text().replace(/\s+/g, ' ');
  const dates = (bodyText.match(/令和\d+年\d+月\d+日|20\d\d[\/年]\d+[\/月]\d+[日]?|\d+\/\d+[（(][月火水木金土日]/g) || []).slice(0, 10);
  console.log('\n日付パターン:', JSON.stringify(dates));

  // メインコンテンツ
  const mainEl = $('#content, #main, .main-content, main, article, body');
  console.log('\n--- メインHTML (先頭 4000) ---');
  console.log(clean(mainEl.first().html()).substring(0, 4000));

  // h2セクション
  console.log('\n--- h2 + 周辺要素 ---');
  $('h2').each((i, h2el) => {
    const h2text = $(h2el).text().replace(/\s+/g, ' ').trim();
    console.log(`\nh2[${i}]: "${h2text}"`);
    let $n = $(h2el).next();
    for (let k = 0; k < 3 && $n.length; k++) {
      console.log(`  次[${k}] <${$n[0]?.tagName}> class="${$n.attr('class')||''}":\n  ${clean($n.html()).substring(0, 800)}`);
      $n = $n.next();
    }
  });

  // h4 周辺
  console.log('\n--- h4 + parent ---');
  $('h4').each((i, h4el) => {
    const text = $(h4el).text().replace(/\s+/g, ' ').trim();
    const $parent = $(h4el).closest('div,article,section,li');
    console.log(`\nh4[${i}]: "${text}"`);
    console.log(`  parent <${$parent[0]?.tagName}> class="${$parent.attr('class')||''}":\n  ${clean($parent.html()).substring(0, 800)}`);
  });

  await browser.close();
})().catch(err => { console.error(err.message); process.exit(1); });
