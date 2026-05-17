'use strict';
/**
 * 近畿地方7府県の地本サイト構造調査スクリプト
 * 実行: node scraper/research_kinki.js
 */

const cheerio = require('cheerio');
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const TARGETS = [
  { pref: '三重',   url: 'https://www.mod.go.jp/pco/mie/' },
  { pref: '滋賀',   url: 'https://www.mod.go.jp/pco/shiga/' },
  { pref: '京都',   url: 'https://www.mod.go.jp/pco/kyoto/' },
  { pref: '大阪',   url: 'https://www.mod.go.jp/pco/osaka/' },
  { pref: '兵庫',   url: 'https://www.mod.go.jp/pco/hyogo/' },
  { pref: '奈良',   url: 'https://www.mod.go.jp/pco/nara/' },
  { pref: '和歌山', url: 'https://www.mod.go.jp/pco/wakayama/' },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function investigate(browser, pref, url) {
  const ctx  = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'ja-JP',
  });
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    try {
      await page.waitForFunction(
        () => { const t = document.title; return t.length > 0 && !t.includes('Just a moment') && !t.includes('しばらくお待ちください'); },
        { timeout: 60_000 }
      );
    } catch {}
    await page.waitForTimeout(2000);

    const html = await page.content();
    const $    = cheerio.load(html, { decodeEntities: false });

    console.log(`\n${'='.repeat(60)}`);
    console.log(`[${pref}] ${url}`);
    console.log(`title: ${$('title').text().trim().substring(0, 80)}`);

    // イベントページへのリンクを探す
    const eventLinks = [];
    $('a').each((_, a) => {
      const href = $(a).attr('href') || '';
      const text = $(a).text().trim();
      if (/event|イベント|行事|催し|news/i.test(href + text)) {
        eventLinks.push(`  ${text.substring(0,40)} → ${href.substring(0,60)}`);
      }
    });
    if (eventLinks.length) {
      console.log('\n--- イベント関連リンク ---');
      eventLinks.slice(0, 10).forEach(l => console.log(l));
    }

    // dl dt/dd 構造
    const dlItems = [];
    $('dl dt').each((_, dt) => {
      const dtText = $(dt).text().trim().substring(0, 60);
      const ddText = $(dt).next('dd').text().trim().substring(0, 80);
      if (dtText || ddText) dlItems.push(`  dt: ${dtText} | dd: ${ddText}`);
    });
    if (dlItems.length) {
      console.log('\n--- dl/dt/dd 構造 (最初の8件) ---');
      dlItems.slice(0, 8).forEach(l => console.log(l));
    }

    // table 構造
    $('table').each((i, tbl) => {
      const rows = $(tbl).find('tr');
      if (rows.length < 2) return;
      const sample = $(rows[1]).find('td, th').map((_, c) => $(c).text().trim().substring(0,20)).get().join(' | ');
      console.log(`\n--- table[${i}] (${rows.length}行) 先頭行: ${sample.substring(0,80)}`);
    });

    // .news, #news, .event, ul.list 等のよくある構造
    ['#news', '.news', '.topNews', '#toppage-news', '.event', '.eventList', '#event', 'ul.list', '.info', '.schedule'].forEach(sel => {
      const el = $(sel);
      if (el.length) {
        console.log(`\n--- ${sel} 検出 (${el.length}個) ---`);
        console.log(el.first().text().trim().substring(0, 200));
      }
    });

    // 全テキストから日付パターンを探す
    const bodyText = $('body').text();
    const dates = [...bodyText.matchAll(/令和\d+年\d+月\d+日|R[0-9]+\.\d+\.\d+|\d{4}[.\/]\d{1,2}[.\/]\d{1,2}|\d+月\d+日/g)].map(m => m[0]);
    if (dates.length) {
      console.log(`\n--- 日付パターン検出 (最初の5件) ---`);
      [...new Set(dates)].slice(0, 5).forEach(d => console.log(`  ${d}`));
    }

    // イベントサブページがあれば追跡
    const subEventUrl = (() => {
      let found = '';
      $('a').each((_, a) => {
        const href = $(a).attr('href') || '';
        if (!found && /event|イベント|行事/i.test(href) && !href.startsWith('http')) {
          found = href.startsWith('/') ? `https://www.mod.go.jp${href}` : `${url}${href}`;
        }
      });
      return found;
    })();

    return subEventUrl;
  } finally {
    await page.close();
    await ctx.close();
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--disable-blink-features=AutomationControlled', '--lang=ja-JP'] });
  try {
    for (const { pref, url } of TARGETS) {
      const subUrl = await investigate(browser, pref, url);
      if (subUrl && subUrl !== url) {
        console.log(`\n→ サブページ追跡: ${subUrl}`);
        await sleep(3000);
        await investigate(browser, `${pref}（サブ）`, subUrl);
      }
      await sleep(5000);
    }
  } finally {
    await browser.close();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
