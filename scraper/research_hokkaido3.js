#!/usr/bin/env node
'use strict';

const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());
const cheerio = require('cheerio');

const BASE = 'https://www.mod.go.jp/pco/sapporo/';

const SUB_PAGES = [
  'event_station.html',
  'event_naval.html',
  'event_concert.html',
  'event_other.html',
];

async function fetchPage(browser, url) {
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
  });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 });
  await page.waitForTimeout(2000);
  const html = await page.content();
  await ctx.close();
  return html;
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--lang=ja-JP'] });
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  for (const sub of SUB_PAGES) {
    const url = BASE + sub;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[${sub}]`);
    try {
      const html = await fetchPage(browser, url);
      const $ = cheerio.load(html, { decodeEntities: false });
      const main = $('#pg_main').html() || $('#main').html() || '';
      console.log('pg_main length:', main.length);
      console.log(main.substring(0, 4000));
    } catch (err) {
      console.log('ERROR:', err.message.substring(0, 80));
    }
    await sleep(4000);
  }

  await browser.close();
  console.log('\n[完了]');
}

main().catch(err => { console.error(err); process.exit(1); });
