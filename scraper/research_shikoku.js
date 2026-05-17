'use strict';
/**
 * 四国4地本のサイト構造調査
 * 愛媛・香川・高知・徳島
 */

const cheerio = require('cheerio');
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const TARGETS = [
  { pref: '愛媛', urls: [
    'https://www.mod.go.jp/pco/ehime/',
    'https://www.mod.go.jp/pco/ehime/event.html',
    'https://www.mod.go.jp/pco/ehime/kouho/event/',
  ]},
  { pref: '香川', urls: [
    'https://www.mod.go.jp/pco/kagawa/',
    'https://www.mod.go.jp/pco/kagawa/event.html',
    'https://www.mod.go.jp/pco/kagawa/event/',
  ]},
  { pref: '高知', urls: [
    'https://www.mod.go.jp/pco/kochi/',
    'https://www.mod.go.jp/pco/kochi/event.html',
    'https://www.mod.go.jp/pco/kochi/event/',
  ]},
  { pref: '徳島', urls: [
    'https://www.mod.go.jp/pco/tokushima/',
    'https://www.mod.go.jp/pco/tokushima/event.html',
    'https://www.mod.go.jp/pco/tokushima/event/',
  ]},
];

async function fetchAndAnalyze(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    try {
      await page.waitForFunction(
        () => { const t = document.title; return t.length > 0 && !t.includes('Just a moment'); },
        { timeout: 20000 }
      );
    } catch {}
    await page.waitForTimeout(2000);
    const html = await page.content();
    const $ = cheerio.load(html, { decodeEntities: false });

    const title = $('title').text().trim();
    const h1 = $('h1').first().text().trim().substring(0, 50);
    const statusCode = 200; // playwright doesn't easily give status for goto

    // イベント関連リンクを探す
    const eventLinks = [];
    $('a').each((_, a) => {
      const href = $(a).attr('href') || '';
      const text = $(a).text().trim();
      if (/event|イベント|行事|説明会|広報|post-/i.test(href + text)) {
        const absHref = href.startsWith('http') ? href : 'https://www.mod.go.jp' + (href.startsWith('/') ? href : '/' + href);
        if (absHref.includes('mod.go.jp')) eventLinks.push(`${absHref} | ${text.substring(0, 30)}`);
      }
    });

    // セクション・記事構造を確認
    const sections = [];
    $('section, article, .event, .post, .news, .item').each((i, el) => {
      if (i >= 5) return;
      sections.push(`${el.tagName}.${$(el).attr('class')?.split(' ')[0]}: ${$(el).text().replace(/\s+/g,' ').trim().substring(0, 60)}`);
    });

    // テーブル構造
    const tables = [];
    $('table').each((i, tbl) => {
      if (i >= 3) return;
      const rows = $(tbl).find('tr');
      const firstRow = rows.first().find('td,th').map((_, c) => $(c).text().trim().substring(0, 20)).get().join(' | ');
      tables.push(`table[${i}] rows=${rows.length}: ${firstRow}`);
    });

    // 本文テキスト先頭
    const bodyText = $('main, .entry-content, #content, .content, body').first().text().replace(/\s+/g, ' ').trim().substring(0, 300);

    return { title, h1, eventLinks: eventLinks.slice(0, 15), sections, tables, bodyText };
  } catch (e) {
    return { error: e.message.substring(0, 60) };
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  for (const { pref, urls } of TARGETS) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`===== ${pref} =====`);

    for (const url of urls) {
      const ctx = await browser.newContext({ locale: 'ja-JP' });
      const page = await ctx.newPage();
      console.log(`\n  URL: ${url}`);
      const result = await fetchAndAnalyze(page, url);
      if (result.error) {
        console.log(`  エラー: ${result.error}`);
      } else {
        console.log(`  title: ${result.title}`);
        console.log(`  h1: ${result.h1}`);
        if (result.eventLinks.length) {
          console.log(`  イベントリンク:`);
          result.eventLinks.forEach(l => console.log(`    ${l}`));
        }
        if (result.sections.length) {
          console.log(`  セクション:`);
          result.sections.forEach(s => console.log(`    ${s}`));
        }
        if (result.tables.length) {
          console.log(`  テーブル:`);
          result.tables.forEach(t => console.log(`    ${t}`));
        }
        console.log(`  本文: ${result.bodyText.substring(0, 200)}`);
      }
      await ctx.close();
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  await browser.close();
})();
