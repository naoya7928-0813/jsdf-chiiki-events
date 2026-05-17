'use strict';
// 岩手地本のカレンダーHTML詳細調査
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());
const cheerio = require('cheerio');

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--lang=ja-JP'] });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'ja-JP', timezoneId: 'Asia/Tokyo',
  });
  const page = await ctx.newPage();
  const url = 'https://www.mod.go.jp/pco/iwate/event/index.html';

  await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 });
  await page.waitForTimeout(3000);
  const html = await page.content();
  await page.close();
  await browser.close();

  const $ = cheerio.load(html, { decodeEntities: false });

  // カレンダー前後の生HTML（前後5000文字）
  const idx = html.indexOf('MON');
  if (idx > 0) {
    console.log('=== MON周辺HTML ===');
    console.log(html.slice(Math.max(0, idx - 200), idx + 8000));
  }

  // イベントPDFリンクを持つtdの親を辿って日付を特定
  console.log('\n=== イベントPDFリンクの文脈 ===');
  $('a[href*="/event/"]').each((_i, a) => {
    const href = $(a).attr('href') || '';
    const $td = $(a).closest('td');
    const $tr = $td.closest('tr');
    const $table = $tr.closest('table');

    // td内のテキスト
    const tdText = $td.text().replace(/\s+/g, ' ').trim();
    // tr内の全tdテキスト
    const trTexts = $tr.find('td').toArray().map(c => $(c).text().replace(/\s+/g, ' ').trim());
    // tableのheader行
    const headers = $table.find('tr').first().find('th,td').toArray().map(c => $(c).text().trim());

    console.log(`href: ${href}`);
    console.log(`  td text: "${tdText}"`);
    console.log(`  tr cells: [${trTexts.join(', ')}]`);
    console.log(`  table headers: [${headers.join(', ')}]`);
    console.log(`  td index in tr: ${$td.index()}`);

    // td のdata属性やclass
    const cls = $td.attr('class') || '';
    const id  = $td.attr('id') || '';
    console.log(`  td class="${cls}" id="${id}"`);
  });
}

main().catch(err => { console.error(err); process.exit(1); });
