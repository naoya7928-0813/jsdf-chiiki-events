'use strict';
// 宮城トップ・青森のイベントHTML詳細調査
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());
const cheerio = require('cheerio');

const TARGETS = [
  { label: '宮城 トップ',  url: 'https://www.mod.go.jp/pco/miyagi/' },
  { label: '青森 トップ',  url: 'https://www.mod.go.jp/pco/aomori/' },
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
    if (!r.html) { console.log(`  ERROR: ${r.error}`); await sleep(3000); continue; }
    console.log(`  status: ${r.status} | title: ${r.title.substring(0, 70)}`);

    const $ = cheerio.load(r.html, { decodeEntities: false });

    // 全aタグのうち日付やイベント含むもの
    console.log('--- イベント関連aタグ (テキスト+href) ---');
    $('a').each((_i, a) => {
      const href = $(a).attr('href') || '';
      const text = $(a).text().replace(/\s+/g, ' ').trim();
      if (/\d{4}\.\d+\.\d+|イベント|演奏会|見学|公開|記念|はたらく|説明会|体験|オープン/i.test(text) &&
          text.length > 3) {
        console.log(`  "${text.slice(0,80)}" → ${href.slice(0, 80)}`);
      }
    });

    // NEWS/EVENTセクションのHTML（3000文字）
    // 「EVENT」または「NEWS」を含む要素の前後HTML
    const rawHtml = r.html;
    const eventIdx = rawHtml.indexOf('EVENT');
    if (eventIdx > 0) {
      console.log('--- EVENT周辺HTML ---');
      console.log(rawHtml.slice(Math.max(0, eventIdx - 100), eventIdx + 3000));
    }
    const newsIdx = rawHtml.indexOf('NEWS 2026');
    if (newsIdx > 0) {
      console.log('--- NEWS 2026 周辺HTML ---');
      console.log(rawHtml.slice(Math.max(0, newsIdx - 200), newsIdx + 2000));
    }

    await sleep(5000);
  }

  await browser.close();
  console.log('\n[完了]');
}

main().catch(err => { console.error(err); process.exit(1); });
