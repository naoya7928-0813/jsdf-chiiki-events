'use strict';
/**
 * 滋賀・和歌山の一覧ページ構造調査
 */

const cheerio = require('cheerio');
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

async function fetchPage(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  try {
    await page.waitForFunction(
      () => { const t = document.title; return t.length > 0 && !t.includes('Just a moment'); },
      { timeout: 30000 }
    );
  } catch {}
  await page.waitForTimeout(2000);
  return await page.content();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: 'ja-JP' });
  const page = await context.newPage();

  // ─── 滋賀 ───────────────────────────────────────────────
  console.log('\n===== 滋賀: event-briefing/ =====');
  {
    const html = await fetchPage(page, 'https://www.mod.go.jp/pco/shiga/event-briefing/');
    const $ = cheerio.load(html, { decodeEntities: false });
    console.log('title:', $('title').text());
    console.log('\n─ mod.go.jp/pco/shiga を含むリンク一覧:');
    $('a[href*="mod.go.jp/pco/shiga"]').each((_, a) => {
      console.log(' ', $(a).attr('href'), '|', $(a).text().trim().substring(0, 40));
    });
    console.log('\n─ 本文先頭300文字:');
    const body = $('main, .entry-content, article').first().text().replace(/\s+/g, ' ').trim();
    console.log(body.substring(0, 300));
  }

  await page.waitForTimeout(3000);

  // 滋賀: トップページのイベントリンク確認
  console.log('\n===== 滋賀: トップページ =====');
  {
    const html = await fetchPage(page, 'https://www.mod.go.jp/pco/shiga/');
    const $ = cheerio.load(html, { decodeEntities: false });
    console.log('\n─ イベント・行事関連リンク:');
    $('a').each((_, a) => {
      const href = $(a).attr('href') || '';
      const text = $(a).text().trim();
      if (/event|イベント|行事|説明会|post-|camp/i.test(href + text)) {
        console.log(' ', href, '|', text.substring(0, 40));
      }
    });
  }

  await page.waitForTimeout(3000);

  // ─── 和歌山 ──────────────────────────────────────────────
  console.log('\n===== 和歌山: category/event/ =====');
  {
    const html = await fetchPage(page, 'https://www.mod.go.jp/pco/wakayama/category/event/');
    const $ = cheerio.load(html, { decodeEntities: false });
    console.log('title:', $('title').text());
    console.log('\n─ mod.go.jp/pco/wakayama を含むリンク一覧:');
    $('a[href*="mod.go.jp/pco/wakayama"]').each((_, a) => {
      console.log(' ', $(a).attr('href'), '|', $(a).text().trim().substring(0, 40));
    });
    console.log('\n─ 本文先頭400文字:');
    const body = $('main, .entry-content, article, .content').first().text().replace(/\s+/g, ' ').trim();
    console.log(body.substring(0, 400));
  }

  await page.waitForTimeout(3000);

  // 和歌山: post-7876の全リンク確認
  console.log('\n===== 和歌山: post-7876（イベント情報まとめページ）のリンク =====');
  {
    const html = await fetchPage(page, 'https://www.mod.go.jp/pco/wakayama/post-7876/');
    const $ = cheerio.load(html, { decodeEntities: false });
    console.log('\n─ 全リンク（wakayama含む）:');
    $('a[href*="wakayama"]').each((_, a) => {
      console.log(' ', $(a).attr('href'), '|', $(a).text().trim().substring(0, 40));
    });
    console.log('\n─ 本文全文:');
    const body = $('main, .entry-content, article, .content').first().text().replace(/\s+/g, ' ').trim();
    console.log(body.substring(0, 600));
  }

  await browser.close();
})();
