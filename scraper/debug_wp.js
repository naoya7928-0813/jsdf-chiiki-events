'use strict';
/**
 * 三重・滋賀・奈良・和歌山のWordPressパーサーデバッグ
 * 実際のページを取得してパーサーの途中結果を表示する
 */

const cheerio = require('cheerio');
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const { toHalfWidth, reiwaToAD, padTwo, isPast } = require('./parsers/utils');
const { parseMiePost, parseMiePostUrls }           = require('./parsers/mie');
const { parseShigaPost, parseShigaPostUrls }       = require('./parsers/shiga');
const { parseNaraPost, parseNaraPostUrls }         = require('./parsers/nara');
const { parseWakayamaPost, parseWakayamaPostUrls } = require('./parsers/wakayama');

const TARGETS = [
  { pref: '三重',   listUrl: 'https://www.mod.go.jp/pco/mie/events-page/',       urlsFn: parseMiePostUrls,      postFn: parseMiePost },
  { pref: '滋賀',   listUrl: 'https://www.mod.go.jp/pco/shiga/event-briefing/',   urlsFn: parseShigaPostUrls,    postFn: parseShigaPost },
  { pref: '奈良',   listUrl: 'https://www.mod.go.jp/pco/nara/events/',            urlsFn: parseNaraPostUrls,     postFn: parseNaraPost },
  { pref: '和歌山', listUrl: 'https://www.mod.go.jp/pco/wakayama/category/event/',urlsFn: parseWakayamaPostUrls, postFn: parseWakayamaPost },
];

async function debugPost(page, pref, url, postFn, counter) {
  console.log(`\n  [${pref}] 投稿取得: ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  try {
    await page.waitForFunction(
      () => { const t = document.title; return t.length > 0 && !t.includes('Just a moment'); },
      { timeout: 20000 }
    );
  } catch {}
  await page.waitForTimeout(1500);
  const html = await page.content();
  const $ = cheerio.load(html, { decodeEntities: false });

  // ── 本文テキスト確認 ──
  const content = $('main, .entry-content, .post-content, article, .content').first();
  const bodyText = content.length
    ? content.text().replace(/\s+/g, ' ').trim()
    : $('body').text().replace(/\s+/g, ' ').trim();
  const halfBody = toHalfWidth(bodyText);

  console.log(`  タイトル: ${$('h1').first().text().trim().substring(0, 60)}`);
  console.log(`  本文(先頭200): ${halfBody.substring(0, 200)}`);

  // ── 日付パターン検索 ──
  const reiwaM = halfBody.match(/令和(\d+)年(\d+)月(\d+)日/);
  const gregM  = halfBody.match(/(\d{4})年(\d+)月(\d+)日/);
  const monthM = halfBody.match(/(\d+)月(\d+)日[（(]/);
  console.log(`  日付候補: 令和=${reiwaM?.[0]} 西暦=${gregM?.[0]} 月日=${monthM?.[0]}`);

  // ── テーブル構造確認 ──
  const tables = $('table');
  if (tables.length) {
    console.log(`  テーブル数: ${tables.length}`);
    tables.each((i, tbl) => {
      if (i >= 2) return;
      $(tbl).find('tr').each((j, tr) => {
        if (j >= 5) return;
        const cells = $(tr).find('td,th').map((_, c) => $(c).text().trim().replace(/\s+/g,' ').substring(0,30)).get();
        console.log(`    table[${i}] row[${j}]: ${cells.join(' | ')}`);
      });
    });
  }

  // ── パーサー実行 ──
  const result = postFn($, url, counter);
  console.log(`  パーサー結果: ${result.length} 件`);
  if (result.length) {
    console.log(`    → ${JSON.stringify(result[0])}`);
  } else {
    // isPast チェックの確認
    if (reiwaM) {
      const y = reiwaToAD(parseInt(reiwaM[1], 10));
      const dateStr = `${y}-${padTwo(parseInt(reiwaM[2], 10))}-${padTwo(parseInt(reiwaM[3], 10))}`;
      console.log(`  isPast("${dateStr}"): ${isPast(dateStr)}`);
    }
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: 'ja-JP' });

  for (const { pref, listUrl, urlsFn, postFn } of TARGETS) {
    console.log(`\n===== ${pref} =====`);
    const listPage = await context.newPage();
    let postUrls = [];
    try {
      await listPage.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      try {
        await listPage.waitForFunction(
          () => { const t = document.title; return t.length > 0 && !t.includes('Just a moment'); },
          { timeout: 30000 }
        );
      } catch {}
      await listPage.waitForTimeout(2000);
      const html = await listPage.content();
      const $ = cheerio.load(html, { decodeEntities: false });
      postUrls = [...new Set(urlsFn($))].slice(0, 3);
      console.log(`一覧URL数: ${postUrls.length}`);
      postUrls.forEach(u => console.log('  ' + u));
    } finally {
      await listPage.close();
    }

    const postPage = await context.newPage();
    for (let i = 0; i < postUrls.length; i++) {
      await debugPost(postPage, pref, postUrls[i], postFn, i + 1);
    }
    await postPage.close();
  }

  await browser.close();
})();
