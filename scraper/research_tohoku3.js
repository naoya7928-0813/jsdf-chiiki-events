'use strict';
// 青森・岩手・宮城・札幌 event.html の調査スクリプト
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());
const cheerio = require('cheerio');

const TARGETS = [
  { label: '札幌 event.html', url: 'https://www.mod.go.jp/pco/sapporo/event.html' },
  { label: '青森トップ',      url: 'https://www.mod.go.jp/pco/aomori/' },
  { label: '岩手 event',     url: 'https://www.mod.go.jp/pco/iwate/event/index.html' },
  { label: '宮城トップ',      url: 'https://www.mod.go.jp/pco/miyagi/' },
];

async function fetchPage(browser, url) {
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'ja-JP', timezoneId: 'Asia/Tokyo',
  });
  const page = await ctx.newPage();
  try {
    const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 });
    await page.waitForTimeout(2000);
    const html = await page.content();
    const title = await page.title();
    return { status: res?.status() ?? 0, html, title };
  } catch (err) {
    return { status: 0, html: '', title: '', error: err.message.substring(0, 100) };
  } finally {
    await ctx.close();
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--lang=ja-JP'] });
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  for (const { label, url } of TARGETS) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`[${label}] ${url}`);

    const r = await fetchPage(browser, url);
    if (!r.html) {
      console.log(`  ERROR (${r.status}): ${r.error}`);
      await sleep(3000);
      continue;
    }

    console.log(`  status: ${r.status} | title: ${r.title.substring(0, 70)}`);

    const $ = cheerio.load(r.html, { decodeEntities: false });

    // テーブル構造を全て出力
    console.log('--- Tables ---');
    $('table').each((i, tbl) => {
      const rows = $(tbl).find('tr');
      if (!rows.length) return;
      console.log(`  [table#${i}] ${rows.length}行`);
      rows.each((j, row) => {
        if (j > 8) { console.log('    ...'); return false; }
        const cells = $(row).find('td, th').map((_k, c) => $(c).text().replace(/\s+/g, ' ').trim().slice(0, 50)).get();
        if (cells.join('').trim()) console.log(`    tr[${j}]: ${cells.join(' | ')}`);
      });
    });

    // 日付含む要素
    console.log('--- 日付要素 ---');
    let cnt = 0;
    $('*').each((_i, el) => {
      const txt = $(el).clone().children().remove().end().text().trim();
      if (/\d+年\d+月|\d+月\d+日|令和\d+/.test(txt) && txt.length > 3 && txt.length < 200) {
        console.log(`  <${el.tagName} class="${$(el).attr('class') || ''}">: ${txt.slice(0, 120)}`);
        if (++cnt >= 20) return false;
      }
    });

    // イベント・広報関連リンク
    console.log('--- イベント関連リンク ---');
    $('a[href]').each((_i, a) => {
      const href = $(a).attr('href') || '';
      const text = $(a).text().trim();
      if (/event|kouho|広報|pr[\/\.]|schedule|calendar|recruit/i.test(href) ||
          /イベント|広報|募集|説明会|見学|公開|演奏/i.test(text)) {
        console.log(`  ${text.slice(0,30)} → ${href.slice(0, 80)}`);
      }
    });

    // 全文テキスト(1500文字)
    console.log('--- テキスト(1500) ---');
    const txt = $.root().text().replace(/\s+/g, ' ').trim().slice(0, 1500);
    console.log(txt);

    await sleep(5000);
  }

  await browser.close();
  console.log('\n[完了]');
}

main().catch(err => { console.error(err); process.exit(1); });
