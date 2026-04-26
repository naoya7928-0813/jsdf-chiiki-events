'use strict';
/**
 * 九州・沖縄8地本のみスクレイピングして events.json を部分更新する
 * 実行: node scraper/scrape_kyushu.js
 */

const path    = require('path');
const fs      = require('fs');
const cheerio = require('cheerio');

const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const { parseFukuoka }   = require('./parsers/fukuoka');
const { parseSaga }      = require('./parsers/saga');
const { parseNagasaki }  = require('./parsers/nagasaki');
const { parseKumamoto }  = require('./parsers/kumamoto');
const { parseOita }      = require('./parsers/oita');
const { parseMiyazaki }  = require('./parsers/miyazaki');
const { parseKagoshima } = require('./parsers/kagoshima');
const { parseOkinawa }   = require('./parsers/okinawa');

const URLS = {
  fukuoka:   'https://www.mod.go.jp/pco/fukuoka/event/index.html',
  saga:      'https://www.mod.go.jp/pco/saga/event/index.html',
  nagasaki:  'https://www.mod.go.jp/pco/nagasaki/event/index.html',
  kumamoto:  'https://www.mod.go.jp/pco/kumamoto/event/index.html',
  oita:      'https://www.mod.go.jp/pco/oita/03_event.html',
  miyazaki:  'https://www.mod.go.jp/pco/miyazaki/event.html',
  kagoshima: 'https://www.mod.go.jp/pco/kagoshima/event/index.html',
  okinawa:   'https://www.mod.go.jp/pco/okinawa/event.html',
};

const OUTPUT = path.join(__dirname, '..', 'public', 'data', 'events.json');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function createCtx(browser) {
  return browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
  });
}

async function fetchPref(browser, pref, url, parseFn) {
  console.log(`[${pref}] アクセス: ${url}`);
  const ctx  = await createCtx(browser);
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    try {
      await page.waitForFunction(
        () => { const t = document.title; return t.length > 0 && !t.includes('Just a moment'); },
        { timeout: 30000 }
      );
    } catch {}
    await page.waitForTimeout(2000);
    const html   = await page.content();
    const $      = cheerio.load(html, { decodeEntities: false });
    const events = parseFn($);
    console.log(`[${pref}] ${events.length} 件取得`);
    events.forEach(e => console.log(`  → ${e.date} ${e.title}`));
    return events;
  } catch (err) {
    console.warn(`[${pref}] エラー: ${err.message.substring(0, 80)}`);
    return null;
  } finally {
    await ctx.close();
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  const results = {};
  results.fukuoka   = await fetchPref(browser, '福岡',   URLS.fukuoka,   parseFukuoka);
  await sleep(10000);
  results.saga      = await fetchPref(browser, '佐賀',   URLS.saga,      parseSaga);
  await sleep(10000);
  results.nagasaki  = await fetchPref(browser, '長崎',   URLS.nagasaki,  parseNagasaki);
  await sleep(10000);
  results.kumamoto  = await fetchPref(browser, '熊本',   URLS.kumamoto,  parseKumamoto);
  await sleep(10000);
  results.oita      = await fetchPref(browser, '大分',   URLS.oita,      parseOita);
  await sleep(10000);
  results.miyazaki  = await fetchPref(browser, '宮崎',   URLS.miyazaki,  parseMiyazaki);
  await sleep(10000);
  results.kagoshima = await fetchPref(browser, '鹿児島', URLS.kagoshima, parseKagoshima);
  await sleep(10000);
  results.okinawa   = await fetchPref(browser, '沖縄',   URLS.okinawa,   parseOkinawa);

  await browser.close();

  const eventsJson = JSON.parse(fs.readFileSync(OUTPUT, 'utf8'));
  for (const [pref, evs] of Object.entries(results)) {
    if (evs === null) {
      console.log(`[${pref}] 取得失敗のため既存データを保持`);
    } else {
      eventsJson[pref] = evs;
      console.log(`[${pref}] → ${evs.length} 件書き込み`);
    }
  }
  eventsJson._updatedAt = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  fs.writeFileSync(OUTPUT, JSON.stringify(eventsJson, null, 2), 'utf8');
  console.log('\n✓ events.json 更新完了');
})();
