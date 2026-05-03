'use strict';
/**
 * 近畿地方のみ再スクレイピングして events.json を部分更新する
 * 実行: node scraper/scrape_kinki.js
 */

const path    = require('path');
const fs      = require('fs');
const cheerio = require('cheerio');

const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const { parseMiePost,      parseMiePostUrls }      = require('./parsers/mie');
const { parseShigaPost,    parseShigaPostUrls }    = require('./parsers/shiga');
const { parseKyoto }                               = require('./parsers/kyoto');
const { parseOsaka }                               = require('./parsers/osaka');
const { parseNaraPost,     parseNaraPostUrls }     = require('./parsers/nara');
const { parseWakayamaPost, parseWakayamaPostUrls } = require('./parsers/wakayama');

const URLS = {
  mie:      'https://www.mod.go.jp/pco/mie/events-page/',
  shiga:    'https://www.mod.go.jp/pco/shiga/category/event/',
  kyoto:    'https://www.mod.go.jp/pco/kyoto/kouhoushitsu/index.html',
  osaka:    'https://www.mod.go.jp/pco/osaka/experience/event.html',
  nara:     'https://www.mod.go.jp/pco/nara/events/',
  wakayama: 'https://www.mod.go.jp/pco/wakayama/category/event/',
};

const OUTPUT = path.join(__dirname, '..', 'public', 'data', 'events.json');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchHtmlPref(ctx, pref, url, parseFn) {
  console.log(`[${pref}] アクセス: ${url}`);
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    try {
      await page.waitForFunction(
        () => { const t = document.title; return t.length > 0 && !t.includes('Just a moment') && !t.includes('しばらくお待ちください'); },
        { timeout: 60_000 }
      );
    } catch {}
    await page.waitForTimeout(2000);
    const html = await page.content();
    const $ = cheerio.load(html, { decodeEntities: false });
    const events = parseFn($);
    console.log(`[${pref}] ${events.length} 件取得`);
    return events;
  } catch (err) {
    console.warn(`[${pref}] エラー: ${err.message.substring(0, 80)}`);
    return null;
  } finally {
    await page.close();
  }
}

async function fetchWpPosts(ctx, pref, listUrl, urlsFn, postFn, maxPosts = 5) {
  console.log(`[${pref}] 一覧ページ取得: ${listUrl}`);
  let postUrls = [];

  const listPage = await ctx.newPage();
  try {
    await listPage.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    try {
      await listPage.waitForFunction(
        () => { const t = document.title; return t.length > 0 && !t.includes('Just a moment') && !t.includes('しばらくお待ちください'); },
        { timeout: 60_000 }
      );
    } catch {}
    await listPage.waitForTimeout(2000);
    const html = await listPage.content();
    const $    = cheerio.load(html, { decodeEntities: false });
    postUrls   = [...new Set(urlsFn($))].slice(0, maxPosts);
    console.log(`[${pref}] 投稿 URL ${postUrls.length} 件取得`);
    postUrls.forEach(u => console.log('  ', u));
  } catch (err) {
    console.warn(`[${pref}] 一覧ページ失敗: ${err.message.substring(0, 60)}`);
  } finally {
    await listPage.close();
  }

  if (postUrls.length === 0) return null;

  const events = [];
  let counter  = 0;
  for (const postUrl of postUrls) {
    const postPage = await ctx.newPage();
    try {
      await postPage.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      try {
        await postPage.waitForFunction(
          () => { const t = document.title; return t.length > 0 && !t.includes('Just a moment') && !t.includes('しばらくお待ちください'); },
          { timeout: 30_000 }
        );
      } catch {}
      await postPage.waitForTimeout(2000);
      const html = await postPage.content();
      const $    = cheerio.load(html, { decodeEntities: false });
      const evs  = postFn($, postUrl, ++counter);
      if (evs.length) {
        console.log(`  → ${evs[0].date} ${evs[0].title.substring(0, 40)}`);
      } else {
        console.log(`  → 0件 (${postUrl.split('/').pop() || postUrl.split('/').slice(-2,-1)[0]})`);
      }
      events.push(...evs);
    } catch (err) {
      console.warn(`  投稿取得失敗: ${err.message.substring(0, 60)}`);
    } finally {
      await postPage.close();
    }
    await sleep(2000);
  }

  console.log(`[${pref}] 合計 ${events.length} 件`);
  return events;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: 'ja-JP', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' });

  const results = {};

  results.mie      = await fetchWpPosts(context, '三重',   URLS.mie,      parseMiePostUrls,      parseMiePost,      5);
  await sleep(10000);
  results.shiga    = await fetchWpPosts(context, '滋賀',   URLS.shiga,    parseShigaPostUrls,    parseShigaPost,    5);
  await sleep(10000);
  results.kyoto    = await fetchHtmlPref(context, '京都',   URLS.kyoto,    parseKyoto);
  await sleep(10000);
  results.osaka    = await fetchHtmlPref(context, '大阪',   URLS.osaka,    parseOsaka);
  await sleep(10000);
  results.nara     = await fetchWpPosts(context, '奈良',   URLS.nara,     parseNaraPostUrls,     parseNaraPost,     5);
  await sleep(10000);
  results.wakayama = await fetchWpPosts(context, '和歌山', URLS.wakayama, parseWakayamaPostUrls, parseWakayamaPost, 5);

  await browser.close();

  // events.json 読み込み・マージ
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
    eventsJson[key] = eventsJson[key].filter(ev => !ev.date || ev.date >= today);
    removedCount += before - eventsJson[key].length;
  }
  if (removedCount > 0) console.log(`[フィルタ] 過去イベント ${removedCount} 件を削除`);

  fs.writeFileSync(OUTPUT, JSON.stringify(eventsJson, null, 2), 'utf8');
  console.log('\n✓ events.json 更新完了');
})();
