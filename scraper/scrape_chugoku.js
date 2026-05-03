'use strict';
/**
 * 中国5地本のみスクレイピングして events.json を部分更新する
 * 実行: node scraper/scrape_chugoku.js
 */

const path    = require('path');
const fs      = require('fs');
const cheerio = require('cheerio');

const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const { parseTottori }  = require('./parsers/tottori');
const { parseShimane }  = require('./parsers/shimane');
const { parseOkayama }  = require('./parsers/okayama');
const { parseHiroshima} = require('./parsers/hiroshima');
const { parseYamaguchi} = require('./parsers/yamaguchi');
const { calcWeekday } = require('./parsers/utils');

const URLS = {
  tottori:   'https://www.mod.go.jp/pco/tottori/content/02-event/event.html',
  shimane:   'https://www.mod.go.jp/pco/shimane/event/event.html',
  okayama:   'https://www.mod.go.jp/pco/okayama/iku/kohogyoumu.html',
  hiroshima: 'https://www.mod.go.jp/pco/hiroshima/events/',
  yamaguchi: 'https://www.mod.go.jp/pco/yamaguchi/event.html',
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
  results.tottori   = await fetchPref(browser, '鳥取',   URLS.tottori,   parseTottori);
  await sleep(10000);
  results.shimane   = await fetchPref(browser, '島根',   URLS.shimane,   parseShimane);
  await sleep(10000);
  results.okayama   = await fetchPref(browser, '岡山',   URLS.okayama,   parseOkayama);
  await sleep(10000);
  results.hiroshima = await fetchPref(browser, '広島',   URLS.hiroshima, parseHiroshima);
  await sleep(10000);
  results.yamaguchi = await fetchPref(browser, '山口',   URLS.yamaguchi, parseYamaguchi);

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
    eventsJson[key] = eventsJson[key].filter(ev => !ev.date || (ev.endDate || ev.date) >= today);
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
