#!/usr/bin/env node
'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const cheerio = require('cheerio');
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const sleep = ms => new Promise(r => setTimeout(r, ms));

// イベントが確認された2ページを詳細調査
const TARGETS = [
  'https://www.mod.go.jp/pco/kanagawa/mado/yokosuka/yokosuka.html',
  'https://www.mod.go.jp/pco/kanagawa/mado/hiratuka/hiratuka.html',
  'https://www.mod.go.jp/pco/kanagawa/mado/kawasaki/kawasaki.html',
  'https://www.mod.go.jp/pco/kanagawa/mado/chuou/chuou.html',
  'https://www.mod.go.jp/pco/kanagawa/mado/sagami/sagami.html',
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  for (const url of TARGETS) {
    const ctx  = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', locale: 'ja-JP' });
    const page = await ctx.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25_000 });
      const html = await page.content();
      const $    = cheerio.load(html);

      console.log(`\n${'='.repeat(70)}`);
      console.log(`URL: ${url}`);
      console.log('='.repeat(70));

      // 「お知らせ」「イベント」セクションを探す
      $('section, div, article, table').each((_, el) => {
        const text = $(el).text().replace(/\s+/g,' ').trim();
        // 日付を含む短い要素を探す
        if (text.length < 500 && /\d+月\d+日|令和\d+年/.test(text) && /説明会|体験|見学|公開|イベント|募集|参加|申込|開催/.test(text)) {
          console.log(`\n  [ブロック] ${text.slice(0, 200)}`);
        }
      });

      // テーブルを探す
      $('table').each((i, tbl) => {
        const rows = $(tbl).find('tr').map((_, tr) => $(tr).text().replace(/\s+/g,' ').trim()).get();
        if (rows.some(r => /\d+月\d+日|令和/.test(r))) {
          console.log(`\n  [テーブル ${i}]`);
          rows.filter(r => r.length > 5).slice(0, 10).forEach(r => console.log(`    ${r}`));
        }
      });

      // リストを探す
      $('ul, ol').each((i, ul) => {
        const items = $(ul).find('li').map((_, li) => $(li).text().replace(/\s+/g,' ').trim()).get();
        if (items.some(t => /\d+月\d+日|令和/.test(t) && t.length > 10)) {
          console.log(`\n  [リスト ${i}]`);
          items.filter(t => t.length > 5).slice(0, 10).forEach(t => console.log(`    - ${t}`));
        }
      });

    } catch (e) {
      console.log(`エラー: ${e.message.slice(0,80)}`);
    } finally {
      await ctx.close();
    }
    await sleep(4000);
  }
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
