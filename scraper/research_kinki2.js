'use strict';
const cheerio = require('cheerio');
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const targets = [
  { pref: '三重_events',   url: 'https://www.mod.go.jp/pco/mie/events-page/' },
  { pref: '滋賀_events',   url: 'https://www.mod.go.jp/pco/shiga/event-briefing/' },
  { pref: '兵庫_event',    url: 'https://www.mod.go.jp/pco/hyogo/event/index.html' },
  { pref: '奈良_events',   url: 'https://www.mod.go.jp/pco/nara/events/' },
  { pref: '和歌山_events', url: 'https://www.mod.go.jp/pco/wakayama/aim/employment-event/' },
  { pref: '京都_event',    url: 'https://www.mod.go.jp/pco/kyoto/kouhoushitsu/index.html' },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function check(browser, pref, url) {
  const ctx = await browser.newContext({
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
    const $ = cheerio.load(html, { decodeEntities: false });

    console.log('\n' + '='.repeat(50));
    console.log(`[${pref}] ${url}`);
    console.log('HTTP title:', $('title').text().trim().substring(0, 70));

    // article/post 一覧（WordPress系）
    let found = 0;
    $('article').each((i, el) => {
      if (i >= 5) return;
      found++;
      const dateEl = $(el).find('time, .entry-date, .post-date, .date').first();
      const dt  = dateEl.attr('datetime') || dateEl.text().trim();
      const ttl = $(el).find('h1,h2,h3,.entry-title,.post-title').first().text().trim();
      const cat = $(el).find('.cat-label,.category,.cat-name').first().text().trim();
      console.log(`  [article] dt:${dt.substring(0,20)} | title:${ttl.substring(0,40)} | cat:${cat.substring(0,20)}`);
    });
    if (!found) {
      // .post, .entry 系
      $('.post, .entry, .wp-post').each((i, el) => {
        if (i >= 5) return;
        found++;
        const dateEl = $(el).find('time, .date, .post-date').first();
        const dt  = dateEl.attr('datetime') || dateEl.text().trim();
        const ttl = $(el).find('h1,h2,h3,.entry-title').first().text().trim();
        console.log(`  [post] dt:${dt.substring(0,20)} | title:${ttl.substring(0,40)}`);
      });
    }

    // カテゴリ別イベントリンク
    const catLinks = [];
    $('a').each((_, a) => {
      const href = $(a).attr('href') || '';
      const txt  = $(a).text().trim().replace(/\s+/g, ' ');
      if (txt.length > 3 && txt.length < 80 && /イベント|説明会|行事|体験|一般公開|募集/.test(txt)) {
        catLinks.push(`  ${txt.substring(0,50)} → ${href.substring(0,60)}`);
      }
    });
    if (catLinks.length) {
      console.log('\n--- イベント関連リンク (max8) ---');
      [...new Set(catLinks)].slice(0, 8).forEach(l => console.log(l));
    }

    // dl/dt/dd
    const dls = [];
    $('dl dt').each((i, dt) => {
      if (i >= 8) return;
      dls.push(`  dt:${$(dt).text().trim().substring(0,40)} | dd:${$(dt).next('dd').text().trim().substring(0,60)}`);
    });
    if (dls.length) { console.log('\n--- dl/dt/dd ---'); dls.forEach(d => console.log(d)); }

    // table
    $('table').each((i, tbl) => {
      if (i >= 5) return;
      const rows = $(tbl).find('tr');
      if (rows.length < 2) return;
      console.log(`\n--- table[${i}] ${rows.length}行 ---`);
      rows.each((j, tr) => {
        if (j >= 3) return;
        const cols = $(tr).find('td,th').map((_, c) => $(c).text().trim().replace(/\s+/g, ' ').substring(0, 25)).get().join(' | ');
        console.log(`  [r${j}] ${cols}`);
      });
    });

    // 日付パターン（本文）
    const bodyText = $('body').text();
    const dates = [...new Set([...bodyText.matchAll(/令和\d+年\d+月\d+日|R\d+\.\d+\.\d+|\d{4}[./]\d{1,2}[./]\d{1,2}|\d+月\d+日/g)].map(m => m[0]))];
    if (dates.length) {
      console.log('\n--- 日付パターン (max6) ---');
      dates.slice(0, 6).forEach(d => console.log(`  ${d}`));
    }
  } catch (err) {
    console.log(`[ERROR] ${pref}: ${err.message.substring(0, 80)}`);
  } finally {
    await page.close();
    await ctx.close();
  }
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--lang=ja-JP'],
  });
  try {
    for (const { pref, url } of targets) {
      await check(browser, pref, url);
      await sleep(4000);
    }
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
