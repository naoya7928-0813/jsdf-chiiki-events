'use strict';
// 宮城event.html・札幌butaikenngaku・青森eventページの詳細調査
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());
const cheerio = require('cheerio');

const TARGETS = [
  { label: '札幌 butaikenngaku', url: 'https://www.mod.go.jp/pco/sapporo/event_butaikenngaku.html' },
  { label: '青森 トップ詳細',    url: 'https://www.mod.go.jp/pco/aomori/' },
  { label: '宮城 トップ詳細',    url: 'https://www.mod.go.jp/pco/miyagi/' },
  { label: '岩手 event calendar',url: 'https://www.mod.go.jp/pco/iwate/event/index.html' },
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

    // テーブル全行出力
    console.log('--- Tables (全行) ---');
    $('table').each((i, tbl) => {
      const rowEls = $(tbl).find('tr').toArray();
      if (!rowEls.length) return;
      const rowTexts = rowEls.map(row =>
        $(row).find('td, th').toArray().map(c => $(c).text().replace(/\s+/g, ' ').trim().slice(0, 60))
      );
      const nonEmpty = rowTexts.filter(cells => cells.join('').trim());
      if (!nonEmpty.length) return;
      console.log(`  [table#${i}] ${rowEls.length}行:`);
      nonEmpty.slice(0, 20).forEach(cells => {
        console.log(`    ${cells.join(' | ')}`);
      });
      if (nonEmpty.length > 20) console.log('    ...');
    });

    // h2/h3/h4 見出し
    console.log('--- Headings ---');
    $('h2,h3,h4').each((_i, el) => {
      const txt = $(el).text().replace(/\s+/g, ' ').trim();
      if (txt) console.log(`  <${el.tagName}>: ${txt.slice(0,80)}`);
    });

    // 日付含む要素
    console.log('--- 日付要素 ---');
    let cnt = 0;
    $('*').each((_i, el) => {
      const txt = $(el).clone().children().remove().end().text().trim();
      if (/\d+年\d+月|\d+月\d+日|令和\d+/.test(txt) && txt.length > 3 && txt.length < 200) {
        console.log(`  <${el.tagName} class="${$(el).attr('class') || ''}">: ${txt.slice(0, 120)}`);
        if (++cnt >= 25) return false;
      }
    });

    // PDF・イベント関連リンク
    console.log('--- リンク ---');
    $('a[href]').each((_i, a) => {
      const href = $(a).attr('href') || '';
      const text = $(a).text().trim().slice(0, 40);
      if (/pdf|event|kouho|広報|schedule|calendar/i.test(href) ||
          /イベント|広報|募集|説明会|見学|公開|演奏|記念|駐屯/i.test(text)) {
        console.log(`  ${text} → ${href.slice(0, 80)}`);
      }
    });

    // 全文テキスト(2000文字)
    console.log('--- テキスト(2000) ---');
    const txt = $.root().text().replace(/\s+/g, ' ').trim().slice(0, 2000);
    console.log(txt);

    await sleep(5000);
  }

  await browser.close();
  console.log('\n[完了]');
}

main().catch(err => { console.error(err); process.exit(1); });
