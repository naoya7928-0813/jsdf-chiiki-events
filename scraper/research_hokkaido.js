#!/usr/bin/env node
'use strict';

const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());
const cheerio = require('cheerio');

const TARGETS = [
  { label: '札幌', url: 'https://www.mod.go.jp/pco/sapporo/event.html' },
  { label: '旭川', url: 'https://www.mod.go.jp/pco/asahikawa/event.html' },
  { label: '帯広', url: 'https://www.mod.go.jp/pco/obihiro/topics_event.html' },
  { label: '函館', url: 'https://www.mod.go.jp/pco/hakodate/publicity/' },
];

async function fetchPage(browser, url) {
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
  });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(2000);
  const html = await page.content();
  await ctx.close();
  return html;
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--lang=ja-JP'] });
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  for (const { label, url } of TARGETS) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[${label}] ${url}`);

    try {
      const html = await fetchPage(browser, url);
      const $ = cheerio.load(html, { decodeEntities: false });

      // タイトル
      console.log('title:', $('title').text().trim().substring(0, 60));

      // イベントっぽいブロックを探す
      const candidates = ['table', 'dl', '.event', '.schedule', '.calendar', '.list', 'section', '.content', '#content', '#main', '.main'];
      for (const sel of candidates) {
        const els = $(sel);
        if (els.length) {
          const text = els.first().text().replace(/\s+/g, ' ').trim().substring(0, 300);
          if (text.length > 10) {
            console.log(`  ${sel} (${els.length}件): ${text}`);
          }
        }
      }

      // 日付パターン（年月日）を含む要素
      console.log('\n--- 日付含む要素 ---');
      let dateCount = 0;
      $('*').each((_i, el) => {
        const txt = $(el).clone().children().remove().end().text().trim();
        if (/\d+年\d+月|\d+月\d+日|令和\d+年/.test(txt) && txt.length < 200) {
          console.log(`  <${el.tagName} class="${$(el).attr('class') || ''}">: ${txt.substring(0, 100)}`);
          dateCount++;
          if (dateCount >= 20) return false;
        }
      });

      // HTML の 3000-7000 文字あたりを出力（メインコンテンツが多い）
      console.log('\n--- Raw HTML[3000:7000] ---');
      console.log(html.substring(3000, 7000));

    } catch (err) {
      console.log('  ERROR:', err.message.substring(0, 80));
    }

    await sleep(5000);
  }

  await browser.close();
  console.log('\n[完了]');
}

main().catch(err => { console.error(err); process.exit(1); });
