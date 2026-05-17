'use strict';
/**
 * 愛媛 event.html の内部構造詳細調査（エンコーディング含む）
 */
const cheerio = require('cheerio');
const iconv   = require('iconv-lite');
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

(async () => {
  const browser = await chromium.launch({ headless: true });

  // ── 愛媛 event.html （Playwright取得）─────────────────────────
  console.log('===== 愛媛 event.html（Playwright）=====');
  {
    const ctx = await browser.newContext({ locale: 'ja-JP' });
    const page = await ctx.newPage();
    await page.goto('https://www.mod.go.jp/pco/ehime/event.html', { waitUntil: 'domcontentloaded', timeout: 25000 });
    try { await page.waitForFunction(() => document.title.length > 0 && !document.title.includes('Just a moment'), { timeout: 20000 }); } catch {}
    await page.waitForTimeout(2000);
    const html = await page.content();
    const $ = cheerio.load(html, { decodeEntities: false });

    console.log('title:', $('title').text());
    console.log('charset:', $('meta[charset]').attr('charset') || $('meta[http-equiv]').attr('content'));

    // ul.event 確認
    const uls = $('ul.event');
    console.log('\nul.event 数:', uls.length);
    uls.each((i, ul) => {
      if (i >= 3) return;
      const heading = $(ul).prevAll('h2,h3,h4,p.title').first().text().trim();
      console.log(`\n  ul.event[${i}] 前見出し: "${heading.substring(0,50)}"`);
      console.log(`  children:`, $(ul).children().map((_, c) => c.tagName).get().join(', '));
      console.log(`  innerText: "${$(ul).text().replace(/\s+/g,' ').trim().substring(0,100)}"`);

      // テーブルを確認
      $(ul).find('table tr').each((j, tr) => {
        if (j >= 5) return;
        const cells = $(tr).find('td,th').map((_, c) => $(c).text().trim().replace(/\s+/g,' ').substring(0, 40)).get();
        console.log(`  row[${j}]: ${cells.join(' | ')}`);
      });
    });

    // 別アプローチ: テーブルと前のテキストノード/見出し
    console.log('\n--- テーブル＋前テキスト ---');
    $('table').each((i, tbl) => {
      if (i >= 8) return;
      // テーブルの直前のテキストノード・見出し・段落を探す
      const prevText = $(tbl).prev().text().trim() || $(tbl).parent().prev().text().trim() || $(tbl).closest('li,div,section').find('h2,h3,h4,p,a').first().text().trim();
      console.log(`\n  table[${i}] 前テキスト: "${prevText.substring(0,60)}"`);
      $(tbl).find('tr').each((j, tr) => {
        if (j >= 5) return;
        const cells = $(tr).find('td,th').map((_, c) => $(c).text().trim().replace(/\s+/g,' ').substring(0, 40)).get();
        console.log(`    row[${j}]: ${cells.join(' | ')}`);
      });
    });

    // HTML一部確認
    console.log('\n--- HTML断片（ul.event最初の500文字）---');
    console.log($('ul.event').first().html()?.substring(0, 500));
    await ctx.close();
  }

  await new Promise(r => setTimeout(r, 5000));

  // ── 高知 全体テキストの追加調査（event_info.htmlが1件だけ？）───
  console.log('\n\n===== 高知: 別URLの確認 =====');
  for (const url of ['https://www.mod.go.jp/pco/kochi/event_info.html']) {
    const ctx = await browser.newContext({ locale: 'ja-JP' });
    const page = await ctx.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      try { await page.waitForFunction(() => document.title.length > 0 && !document.title.includes('Just a moment'), { timeout: 15000 }); } catch {}
      await page.waitForTimeout(2000);
      const html = await page.content();
      const $ = cheerio.load(html, { decodeEntities: false });
      console.log(`\nURL: ${url}`);
      console.log('title:', $('title').text());
      $('table').each((i, tbl) => {
        if (i >= 3) return;
        $(tbl).find('tr').each((j, tr) => {
          if (j >= 6) return;
          const cells = $(tr).find('td,th').map((_, c) => $(c).text().trim().replace(/\s+/g,' ').substring(0, 40)).get();
          console.log(`  table[${i}] row[${j}]: ${cells.join(' | ')}`);
        });
      });
    } catch(e) { console.log('エラー:', e.message.substring(0,60)); }
    await ctx.close();
    await new Promise(r => setTimeout(r, 3000));
  }

  // ── 徳島 追加確認（5月以降のイベントページ）────────────────────
  console.log('\n\n===== 徳島: 5月のイベントページ確認 =====');
  {
    const ctx = await browser.newContext({ locale: 'ja-JP' });
    const page = await ctx.newPage();
    // event2026_4.html などが存在するか試す
    for (const url of [
      'https://www.mod.go.jp/pco/tokushima/event2026_4.html',
      'https://www.mod.go.jp/pco/tokushima/event2026_5.html',
      'https://www.mod.go.jp/pco/tokushima/event_info.html',
    ]) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        const t = await page.title();
        console.log(`${url} → ${t}`);
      } catch(e) {
        console.log(`${url} → エラー: ${e.message.substring(0,40)}`);
      }
      await new Promise(r => setTimeout(r, 2000));
    }
    await ctx.close();
  }

  await browser.close();
})();
