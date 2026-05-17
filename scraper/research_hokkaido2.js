#!/usr/bin/env node
'use strict';

const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());
const cheerio = require('cheerio');

async function fetchPage(browser, url) {
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
  });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 });
  await page.waitForTimeout(3000);
  const html = await page.content();
  await ctx.close();
  return html;
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--lang=ja-JP'] });
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // 札幌 - メインコンテンツ部分を取得
  console.log('=== 札幌 ===');
  const sapHtml = await fetchPage(browser, 'https://www.mod.go.jp/pco/sapporo/event.html');
  const $sap = cheerio.load(sapHtml, { decodeEntities: false });
  const sapMain = $sap('#main').html() || $sap('body').html() || '';
  console.log('main content length:', sapMain.length);
  console.log(sapMain.substring(0, 6000));

  await sleep(5000);

  // 帯広 - JS実行後のコンテンツ
  console.log('\n=== 帯広 (JS実行後) ===');
  const obiHtml = await fetchPage(browser, 'https://www.mod.go.jp/pco/obihiro/topics_event.html');
  const $obi = cheerio.load(obiHtml, { decodeEntities: false });
  const obiMain = $obi('#col_main').html() || $obi('section').eq(3).html() || $obi('body').text();
  console.log(obiMain.substring(0, 5000));

  await sleep(5000);

  // 旭川 - テーブル内容詳細
  console.log('\n=== 旭川 テーブル全件 ===');
  const asiHtml = await fetchPage(browser, 'https://www.mod.go.jp/pco/asahikawa/event.html');
  const $asi = cheerio.load(asiHtml, { decodeEntities: false });
  $asi('table tr').each((i, row) => {
    const cols = $asi(row).children('td, th').map((_, c) => $asi(c).text().replace(/\s+/g, ' ').trim()).get();
    if (cols.length >= 2) console.log(cols.join(' | '));
  });

  await browser.close();
  console.log('\n[完了]');
}

main().catch(err => { console.error(err); process.exit(1); });
