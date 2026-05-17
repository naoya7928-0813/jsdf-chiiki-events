'use strict';
const cheerio = require('cheerio');
const { parseMiePost } = require('./parsers/mie');
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  for (const url of ['https://www.mod.go.jp/pco/mie/post-9077/', 'https://www.mod.go.jp/pco/mie/post-9066/']) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    const html = await page.content();
    const $ = cheerio.load(html, { decodeEntities: false });
    const evs = parseMiePost($, url, 1);
    console.log(url.split('/').slice(-2,-1)[0], '->', evs.length ? evs[0].title : '0件');
  }
  await browser.close();
})();
