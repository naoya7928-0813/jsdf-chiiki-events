'use strict';
/**
 * 四国4地本のみスクレイピングして events.json を部分更新する
 * 実行: node scraper/scrape_shikoku.js
 */

const path    = require('path');
const fs      = require('fs');
const cheerio = require('cheerio');

const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const { parseEhime }     = require('./parsers/ehime');
const { parseKagawa }    = require('./parsers/kagawa');
const { parseKochi }     = require('./parsers/kochi');
const { parseTokushima } = require('./parsers/tokushima');
const { calcWeekday } = require('./parsers/utils');

const URLS = {
  ehime:     'https://www.mod.go.jp/pco/ehime/event.html',
  kagawa:    'https://www.mod.go.jp/pco/kagawa/event.html',
  kochi:     'https://www.mod.go.jp/pco/kochi/event_info.html',
  tokushima: 'https://www.mod.go.jp/pco/tokushima/event.html',
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
  results.ehime     = await fetchPref(browser, '愛媛',   URLS.ehime,     parseEhime);
  await sleep(10000);
  results.kagawa    = await fetchPref(browser, '香川',   URLS.kagawa,    parseKagawa);
  await sleep(10000);
  results.kochi     = await fetchPref(browser, '高知',   URLS.kochi,     parseKochi);
  await sleep(10000);
  results.tokushima = await fetchPref(browser, '徳島',   URLS.tokushima, parseTokushima);

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
  eventsJson.updatedAt = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

  // 今日（JST）より前の日付のイベントを削除
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  let removedCount = 0;
  for (const key of Object.keys(eventsJson)) {
    if (!Array.isArray(eventsJson[key])) continue;
    const before = eventsJson[key].length;
    eventsJson[key] = eventsJson[key].filter(ev => {
      if (!ev.date) return false;
      if ((ev.endDate || ev.date) < today) return false;
      if (!ev.title || /^お知らせ$/.test(ev.title.trim())) return false;
      return true;
    });
    removedCount += before - eventsJson[key].length;
    eventsJson[key].forEach(ev => {
      if (ev.date)    ev.weekday    = calcWeekday(ev.date);
      if (ev.endDate) ev.endWeekday = calcWeekday(ev.endDate);
    });
  }
  if (removedCount > 0) console.log(`[フィルタ] 過去イベント ${removedCount} 件を削除`);

  fs.writeFileSync(OUTPUT, JSON.stringify(eventsJson, null, 2), 'utf8');
  console.log('\n✓ events.json 更新完了');
})();
