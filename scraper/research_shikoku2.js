'use strict';
/**
 * 四国4地本の詳細HTML構造調査
 */

const cheerio = require('cheerio');
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

async function fetchPage(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
  try {
    await page.waitForFunction(
      () => { const t = document.title; return t.length > 0 && !t.includes('Just a moment'); },
      { timeout: 20000 }
    );
  } catch {}
  await page.waitForTimeout(2000);
  return await page.content();
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  // ─── 愛媛 event.html ─────────────────────────────────────────
  console.log('\n===== 愛媛: event.html 詳細 =====');
  {
    const ctx = await browser.newContext({ locale: 'ja-JP' });
    const page = await ctx.newPage();
    const html = await fetchPage(page, 'https://www.mod.go.jp/pco/ehime/event.html');
    const $ = cheerio.load(html, { decodeEntities: false });

    // ul.event の各 li を確認
    console.log('ul.event li 数:', $('ul.event li').length);
    $('ul.event li').each((i, li) => {
      if (i >= 3) return;
      console.log(`\n  li[${i}]:`);
      // h3/h4 タイトル
      const heading = $(li).find('h3,h4,h2,.title,.event_ttl').first().text().trim();
      console.log(`    heading: ${heading.substring(0, 50)}`);
      // table 構造
      $(li).find('table tr').each((j, tr) => {
        if (j >= 5) return;
        const cells = $(tr).find('td,th').map((_, c) => $(c).text().trim().replace(/\s+/g,' ').substring(0, 30)).get();
        console.log(`    row[${j}]: ${cells.join(' | ')}`);
      });
      // テキスト全体
      console.log(`    text: ${$(li).text().replace(/\s+/g,' ').trim().substring(0, 100)}`);
    });

    // section ごとに確認
    console.log('\n--- section/div.event ---');
    $('section, div.event').each((i, el) => {
      if (i >= 4) return;
      const heading = $(el).find('h2,h3,h4').first().text().trim();
      console.log(`\n  [${i}] heading: ${heading.substring(0, 40)}`);
      $(el).find('table tr').each((j, tr) => {
        if (j >= 4) return;
        const cells = $(tr).find('td,th').map((_, c) => $(c).text().trim().replace(/\s+/g,' ').substring(0, 30)).get();
        console.log(`    row[${j}]: ${cells.join(' | ')}`);
      });
    });
    await ctx.close();
  }

  await new Promise(r => setTimeout(r, 5000));

  // ─── 香川 event.html ─────────────────────────────────────────
  console.log('\n\n===== 香川: event.html 詳細 =====');
  {
    const ctx = await browser.newContext({ locale: 'ja-JP' });
    const page = await ctx.newPage();
    const html = await fetchPage(page, 'https://www.mod.go.jp/pco/kagawa/event.html');
    const $ = cheerio.load(html, { decodeEntities: false });

    console.log('テーブル数:', $('table').length);
    $('table').each((i, tbl) => {
      if (i >= 6) return;
      const prevHeading = $(tbl).prevAll('h2,h3,h4').first().text().trim();
      console.log(`\n  table[${i}] 前の見出し: "${prevHeading.substring(0,30)}"`);
      $(tbl).find('tr').each((j, tr) => {
        if (j >= 5) return;
        const cells = $(tr).find('td,th').map((_, c) => $(c).text().trim().replace(/\s+/g,' ').substring(0, 30)).get();
        console.log(`    row[${j}]: ${cells.join(' | ')}`);
      });
    });

    // 個別イベントページリンク確認
    console.log('\n個別ページリンク:');
    $('a[href*="/event/"]').each((_, a) => {
      console.log(' ', $(a).attr('href'), '|', $(a).text().trim().substring(0, 40));
    });
    await ctx.close();
  }

  await new Promise(r => setTimeout(r, 5000));

  // ─── 高知 event_info.html ────────────────────────────────────
  console.log('\n\n===== 高知: event_info.html =====');
  {
    const ctx = await browser.newContext({ locale: 'ja-JP' });
    const page = await ctx.newPage();
    const html = await fetchPage(page, 'https://www.mod.go.jp/pco/kochi/event_info.html');
    const $ = cheerio.load(html, { decodeEntities: false });
    console.log('title:', $('title').text());
    console.log('body先頭500:', $('body').text().replace(/\s+/g,' ').trim().substring(0, 500));
    $('table').each((i, tbl) => {
      if (i >= 4) return;
      console.log(`\n  table[${i}]:`);
      $(tbl).find('tr').each((j, tr) => {
        if (j >= 5) return;
        const cells = $(tr).find('td,th').map((_, c) => $(c).text().trim().replace(/\s+/g,' ').substring(0, 30)).get();
        console.log(`    row[${j}]: ${cells.join(' | ')}`);
      });
    });
    await ctx.close();
  }

  await new Promise(r => setTimeout(r, 5000));

  // ─── 徳島 event.html ─────────────────────────────────────────
  console.log('\n\n===== 徳島: event.html 詳細 =====');
  {
    const ctx = await browser.newContext({ locale: 'ja-JP' });
    const page = await ctx.newPage();
    const html = await fetchPage(page, 'https://www.mod.go.jp/pco/tokushima/event.html');
    const $ = cheerio.load(html, { decodeEntities: false });

    console.log('section 数:', $('section').length);
    $('section').each((i, sec) => {
      if (i >= 6) return;
      const heading = $(sec).find('h2,h3,h4').first().text().trim();
      const text = $(sec).text().replace(/\s+/g,' ').trim().substring(0, 120);
      console.log(`\n  section[${i}] h: "${heading}" | ${text}`);
      $(sec).find('table tr').each((j, tr) => {
        if (j >= 4) return;
        const cells = $(tr).find('td,th').map((_, c) => $(c).text().trim().replace(/\s+/g,' ').substring(0, 30)).get();
        console.log(`    row[${j}]: ${cells.join(' | ')}`);
      });
    });
    // 本文全体テキスト
    console.log('\n本文テキスト(先頭600):');
    console.log($('body').text().replace(/\s+/g,' ').trim().substring(0, 600));
    await ctx.close();
  }

  await browser.close();
})();
