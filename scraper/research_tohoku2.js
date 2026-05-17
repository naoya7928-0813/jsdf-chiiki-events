#!/usr/bin/env node
'use strict';

const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());
const cheerio = require('cheerio');

const TARGETS = [
  { label: '青森トップ', url: 'https://www.mod.go.jp/pco/aomori/' },
  { label: '岩手イベント', url: 'https://www.mod.go.jp/pco/iwate/event/index.html' },
  { label: '宮城イベント', url: 'https://www.mod.go.jp/pco/miyagi/event.html' },
  { label: '秋田イベント', url: 'https://www.mod.go.jp/pco/akita/asset/event/index.html' },
  { label: '山形イベント', url: 'https://www.mod.go.jp/pco/yamagata/event/event.html' },
  { label: '福島イベント', url: 'https://www.mod.go.jp/pco/fukushima/pr/event.html' },
];

async function fetchPage(browser, url) {
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'ja-JP', timezoneId: 'Asia/Tokyo',
  });
  const page = await ctx.newPage();
  try {
    const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 });
    await page.waitForTimeout(2000);
    const html = await page.content();
    const title = await page.title();
    return { status: res.status(), html, title };
  } catch (err) {
    return { status: 0, html: '', title: '', error: err.message.substring(0, 60) };
  } finally {
    await ctx.close();
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--lang=ja-JP'] });
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  for (const { label, url } of TARGETS) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[${label}] ${url}`);

    const r = await fetchPage(browser, url);
    if (!r.html) {
      console.log(`  ERROR (${r.status}): ${r.error}`);
      await sleep(3000);
      continue;
    }

    console.log(`  status: ${r.status} | title: ${r.title.substring(0, 60)}`);

    const $ = cheerio.load(r.html, { decodeEntities: false });

    // 日付含む要素を探す
    console.log('--- 日付含む要素 ---');
    let cnt = 0;
    $('*').each((_i, el) => {
      const txt = $(el).clone().children().remove().end().text().trim();
      if (/\d+年\d+月|\d+月\d+日|令和\d+/.test(txt) && txt.length > 3 && txt.length < 200) {
        console.log(`  <${el.tagName} class="${$(el).attr('class') || ''}">: ${txt.substring(0, 100)}`);
        if (++cnt >= 15) return false;
      }
    });

    // テーブル・リスト構造
    console.log('--- Tables/Lists ---');
    $('table, dl, .event-list, .schedule, section').each((i, el) => {
      if (i > 5) return false;
      const txt = $(el).text().replace(/\s+/g, ' ').trim().substring(0, 200);
      if (txt.length > 10) {
        console.log(`  [${el.tagName}.${$(el).attr('class') || ''}]: ${txt}`);
      }
    });

    // HTML raw snippet
    console.log('--- HTML[3000:6000] ---');
    console.log(r.html.substring(3000, 6000));

    await sleep(5000);
  }

  await browser.close();
  console.log('\n[完了]');
}

main().catch(err => { console.error(err); process.exit(1); });
