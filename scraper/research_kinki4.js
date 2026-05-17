'use strict';
const cheerio = require('cheerio');
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());
const sleep = ms => new Promise(r => setTimeout(r, ms));

const targets = [
  { pref: '大阪_event_full', url: 'https://www.mod.go.jp/pco/osaka/experience/event.html' },
  { pref: '兵庫_img',        url: 'https://www.mod.go.jp/pco/hyogo/' },
  { pref: '三重_post_full',  url: 'https://www.mod.go.jp/pco/mie/post-9077/' },
  { pref: '奈良_list_full',  url: 'https://www.mod.go.jp/pco/nara/events/' },
];

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
    const $    = cheerio.load(html, { decodeEntities: false });

    console.log('\n' + '='.repeat(60));
    console.log(`[${pref}]`);

    if (pref === '兵庫_img') {
      // 画像URLを探す
      console.log('--- img src (最初の20件) ---');
      $('img').each((i, el) => {
        if (i >= 20) return;
        const src = $(el).attr('src') || '';
        const alt = $(el).attr('alt') || '';
        if (src) console.log(`  ${alt.substring(0,20)} → ${src.substring(0,80)}`);
      });
      // a href画像系
      console.log('\n--- a[href] で画像/PDF に繋がるもの ---');
      $('a[href]').each((_, a) => {
        const href = $(a).attr('href') || '';
        if (/\.(pdf|jpg|jpeg|png|gif)/i.test(href)) {
          console.log(`  ${$(a).text().trim().substring(0,30)} → ${href.substring(0,70)}`);
        }
      });
    }

    if (pref === '大阪_event_full') {
      // テーブル全体を出力（最初の12テーブル）
      $('table').each((i, tbl) => {
        if (i >= 12) return;
        const rows = $(tbl).find('tr');
        console.log(`\n--- table[${i}] (${rows.length}行) ---`);
        rows.each((j, tr) => {
          const cols = $(tr).find('td,th').map((_, c) => {
            return $(c).text().trim().replace(/\s+/g, ' ').substring(0, 40);
          }).get().join(' | ');
          if (cols.trim()) console.log(`  [r${j}] ${cols}`);
        });
      });
      // h2/h3 見出し
      $('h1,h2,h3,h4').each((_, h) => {
        const txt = $(h).text().trim().replace(/\s+/g, ' ');
        if (txt.length > 3 && txt.length < 100) console.log(`  <${h.tagName}> ${txt}`);
      });
    }

    if (pref === '三重_post_full') {
      // 本文全体（最初の3000文字）
      const bodyTxt = $('main, .entry-content, .post-content, article').first().text().replace(/\s+/g, ' ').trim();
      console.log(`本文 (最初2000文字):\n${bodyTxt.substring(0, 2000)}`);
      // time要素
      $('time').each((_, t) => {
        console.log(`  <time> datetime="${$(t).attr('datetime')}" text="${$(t).text().trim()}"`);
      });
    }

    if (pref === '奈良_list_full') {
      // article 構造
      $('article, .news-list li, .post-list li').each((i, el) => {
        if (i >= 8) return;
        const timeEl = $(el).find('time');
        const dt = timeEl.attr('datetime') || timeEl.text().trim();
        const ttl = $(el).find('h2,h3,h1,.entry-title,.post-title').first().text().trim();
        const href = $(el).find('a').first().attr('href') || '';
        console.log(`  [${i}] dt:${dt} | title:${ttl.substring(0,50)} | ${href.substring(0,60)}`);
      });
      // time要素一覧
      console.log('\n--- time 要素 ---');
      $('time').each((i, t) => {
        if (i >= 10) return;
        console.log(`  datetime="${$(t).attr('datetime')}" text="${$(t).text().trim()}"`);
      });
      // ul li a 構造
      console.log('\n--- post リンク ---');
      $('a[href*="post-"]').each((i, a) => {
        if (i >= 10) return;
        console.log(`  ${$(a).text().trim().replace(/\s+/g,' ').substring(0,70)} → ${$(a).attr('href')}`);
      });
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
