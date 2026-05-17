#!/usr/bin/env node
'use strict';

const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());
const cheerio = require('cheerio');

const PREFS = [
  { id: 'aomori',   label: '青森', base: 'https://www.mod.go.jp/pco/aomori/' },
  { id: 'iwate',    label: '岩手', base: 'https://www.mod.go.jp/pco/iwate/' },
  { id: 'miyagi',   label: '宮城', base: 'https://www.mod.go.jp/pco/miyagi/' },
  { id: 'akita',    label: '秋田', base: 'https://www.mod.go.jp/pco/akita/' },
  { id: 'yamagata', label: '山形', base: 'https://www.mod.go.jp/pco/yamagata/' },
  { id: 'fukushima',label: '福島', base: 'https://www.mod.go.jp/pco/fukushima/' },
];

const EVENT_CANDIDATES = ['event.html', 'event/', 'event/index.html', 'kouho/', 'topics.html', 'info.html'];

async function fetchPage(browser, url, timeout = 20000) {
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'ja-JP', timezoneId: 'Asia/Tokyo',
  });
  const page = await ctx.newPage();
  try {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
    await page.waitForTimeout(2000);
    const html = await page.content();
    const title = await page.title();
    await ctx.close();
    return { status: res.status(), html, title };
  } catch (err) {
    await ctx.close();
    return { status: 0, html: '', title: '', error: err.message };
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--lang=ja-JP'] });
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  for (const pref of PREFS) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[${pref.label}] ${pref.base}`);

    // トップページ
    const top = await fetchPage(browser, pref.base);
    if (top.status === 200) {
      console.log(`  top: ${top.status} | ${top.title.substring(0, 60)}`);
      // イベントリンクを探す
      const $ = cheerio.load(top.html, { decodeEntities: false });
      const links = [];
      $('a[href]').each((_i, a) => {
        const href = $(a).attr('href') || '';
        const text = $(a).text().replace(/\s+/g, ' ').trim();
        if (/event|イベント|行事|広報|schedule|kouho/i.test(href + text)) {
          links.push({ href, text: text.substring(0, 30) });
        }
      });
      console.log(`  event links (${links.length}):`);
      links.slice(0, 8).forEach(l => console.log(`    ${l.href} | ${l.text}`));
    } else {
      console.log(`  top: ${top.status} | ERROR: ${top.error || ''}`);
    }

    await sleep(3000);

    // イベントページ候補を試す
    for (const cand of EVENT_CANDIDATES) {
      const url = pref.base + cand;
      const r = await fetchPage(browser, url, 12000);
      if (r.status === 200) {
        console.log(`  [OK] ${url} | ${r.title.substring(0, 60)}`);
        // HTMLの主要部分
        const $ = cheerio.load(r.html, { decodeEntities: false });
        // 日付含む要素
        const dateEls = [];
        $('*').each((_i, el) => {
          const txt = $(el).clone().children().remove().end().text().trim();
          if (/\d+年\d+月|\d+月\d+日|令和\d+/.test(txt) && txt.length < 200 && txt.length > 3) {
            dateEls.push(`<${el.tagName} class="${$(el).attr('class') || ''}">: ${txt.substring(0, 80)}`);
          }
          if (dateEls.length >= 10) return false;
        });
        console.log(`  date elements (${dateEls.length}):`);
        dateEls.forEach(d => console.log(`    ${d}`));
        // HTML snippet
        console.log(`  HTML[3000:5500]: ${r.html.substring(3000, 5500)}`);
        break;
      } else {
        console.log(`  [ ] ${url} → ${r.status}`);
      }
      await sleep(1000);
    }

    await sleep(5000);
  }

  await browser.close();
  console.log('\n[完了]');
}

main().catch(err => { console.error(err); process.exit(1); });
