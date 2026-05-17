#!/usr/bin/env node
'use strict';

/**
 * 中部地方 10地本のイベントページ構造リサーチスクリプト
 * 中部防衛局管轄: 新潟・富山・石川・福井・山梨・長野・岐阜・静岡・愛知・三重
 *
 * 調査内容:
 *  - イベントページURL（ナビからの発見）
 *  - HTML構造（セレクタ・タイトル・日付・場所の格納方法）
 *  - 現在のイベント件数・内容
 */

const cheerio = require('cheerio');
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const BETWEEN_MS = 12_000;

// 中部防衛局管轄 10地本
const PREFS = [
  { id: 'niigata',   label: '新潟', url: 'https://www.mod.go.jp/pco/niigata/' },
  { id: 'toyama',    label: '富山', url: 'https://www.mod.go.jp/pco/toyama/' },
  { id: 'ishikawa',  label: '石川', url: 'https://www.mod.go.jp/pco/ishikawa/' },
  { id: 'fukui',     label: '福井', url: 'https://www.mod.go.jp/pco/fukui/' },
  { id: 'yamanashi', label: '山梨', url: 'https://www.mod.go.jp/pco/yamanashi/' },
  { id: 'nagano',    label: '長野', url: 'https://www.mod.go.jp/pco/nagano/' },
  { id: 'gifu',      label: '岐阜', url: 'https://www.mod.go.jp/pco/gifu/' },
  { id: 'shizuoka',  label: '静岡', url: 'https://www.mod.go.jp/pco/shizuoka/' },
  { id: 'aichi',     label: '愛知', url: 'https://www.mod.go.jp/pco/aichi/' },
  { id: 'mie',       label: '三重', url: 'https://www.mod.go.jp/pco/mie/' },
];

async function createContext(browser) {
  const ctx = await browser.newContext({
    userAgent:  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport:   { width: 1280, height: 800 },
    locale:     'ja-JP',
    timezoneId: 'Asia/Tokyo',
    extraHTTPHeaders: {
      'Accept-Language':           'ja,en-US;q=0.9,en;q=0.8',
      'Accept':                    'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Upgrade-Insecure-Requests': '1',
    },
  });
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins',   { get: () => [1,2,3,4,5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['ja-JP','ja','en-US'] });
    window.chrome = { runtime: {} };
  });
  return ctx;
}

function isChallengeTitle(t) {
  return t.includes('しばらくお待ちください') || t.includes('Just a moment') || t.includes('Attention Required');
}

async function waitForPage(page) {
  try {
    await page.waitForFunction(
      () => {
        const t = document.title;
        return t.length > 0 && !t.includes('Just a moment') && !t.includes('しばらくお待ちください');
      },
      { timeout: 90_000 }
    );
  } catch { /* タイムアウト or チャレンジなし */ }
  await page.waitForTimeout(2000);
}

/** ナビゲーションからイベント関連リンクを抽出 */
function findEventLinks($, baseUrl) {
  const keywords = /イベント|event|説明会|セミナー|募集|行事|見学|体験/i;
  const found = [];
  $('a[href]').each((_i, el) => {
    const text = $(el).text().replace(/\s+/g, '').trim();
    const href = $(el).attr('href') || '';
    if (!keywords.test(text) && !keywords.test(href)) return;
    if (href.startsWith('#') || href.startsWith('javascript') || href.startsWith('mailto')) return;
    try {
      const abs = new URL(href, baseUrl).href;
      if (!abs.includes('mod.go.jp')) return;
      found.push({ text, href: abs });
    } catch { /* ignore */ }
  });
  // 重複除去
  const seen = new Set();
  return found.filter(x => { if (seen.has(x.href)) return false; seen.add(x.href); return true; });
}

/** イベントページの構造を調査 */
function analyzeEventPage($, url) {
  const selectors = [
    'section.subSec', 'section[id]', 'div.post h3', 'div.post',
    'article', 'h3', 'h4', 'table', 'dl',
    '.event', 'div[class*="event"]', '.box', 'ul li',
    '#contents', '.contents', '.main',
  ];
  const hits = {};
  for (const sel of selectors) {
    const n = $(sel).length;
    if (n > 0) hits[sel] = n;
  }

  // h3・h4テキスト（最初の5件）
  const h3s = [], h4s = [];
  $('h3').slice(0, 5).each((_i, el) => h3s.push($(el).text().replace(/\s+/g, ' ').trim().substring(0, 60)));
  $('h4').slice(0, 5).each((_i, el) => h4s.push($(el).text().replace(/\s+/g, ' ').trim().substring(0, 60)));

  // 日付パターンを含むテキストノード（令和・数字/月/日）
  const bodyText = $('body').text().replace(/\s+/g, ' ');
  const dateHits = (bodyText.match(/令和\d+年\d+月\d+日|20\d\d[\/年]\d+[\/月]\d+[日]?/g) || []).slice(0, 6);

  // メインコンテンツ HTML（3000文字）
  const mainHtml = ($('#contents, .contents, main, article, body').first().html() || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .substring(0, 3000);

  return { selectors: hits, h3s, h4s, dateHits, mainHtml };
}

async function researchPref(browser, pref) {
  const ctx  = await createContext(browser);
  const page = await ctx.newPage();
  const result = {
    id:        pref.id,
    label:     pref.label,
    homeUrl:   pref.url,
    accessible: false,
    cloudflare: false,
    eventLinks: [],
    eventPages: [],
  };

  try {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`[${pref.label}] ホーム: ${pref.url}`);

    await page.goto(pref.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await waitForPage(page);

    const homeHtml  = await page.content();
    const homeTitle = (homeHtml.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '';
    console.log(`  title: ${homeTitle.trim().substring(0, 60)}`);

    if (isChallengeTitle(homeTitle)) {
      result.cloudflare = true;
      console.log(`  → Cloudflare ブロック`);
      return result;
    }

    result.accessible = true;
    const $home = cheerio.load(homeHtml, { decodeEntities: false });
    result.eventLinks = findEventLinks($home, pref.url);
    console.log(`  イベント関連リンク: ${result.eventLinks.length} 件`);
    result.eventLinks.slice(0, 5).forEach(l => console.log(`    ・[${l.text}] ${l.href}`));

    // イベントページを最大2件調査
    const toVisit = result.eventLinks.slice(0, 2);
    for (const link of toVisit) {
      await page.waitForTimeout(3000);
      console.log(`\n  → イベントページ: ${link.href}`);
      try {
        await page.goto(link.href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await waitForPage(page);

        const html  = await page.content();
        const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '';
        console.log(`    title: ${title.trim().substring(0, 60)}`);

        if (isChallengeTitle(title)) {
          console.log(`    → Cloudflare ブロック`);
          continue;
        }

        const $ = cheerio.load(html, { decodeEntities: false });
        const analysis = analyzeEventPage($, link.href);

        console.log(`    セレクタ: ${JSON.stringify(analysis.selectors)}`);
        console.log(`    h3: ${JSON.stringify(analysis.h3s)}`);
        console.log(`    h4: ${JSON.stringify(analysis.h4s)}`);
        console.log(`    日付パターン: ${JSON.stringify(analysis.dateHits)}`);
        console.log(`    HTML(先頭800): ${analysis.mainHtml.substring(0, 800)}`);

        result.eventPages.push({
          url:      link.href,
          title:    title.trim(),
          analysis,
        });
      } catch (err) {
        console.log(`    エラー: ${err.message.substring(0, 80)}`);
      }
    }

  } catch (err) {
    console.log(`  エラー: ${err.message.substring(0, 80)}`);
  } finally {
    await page.close();
    await ctx.close();
  }

  return result;
}

async function main() {
  const isLinux = process.platform === 'linux';
  const browser = await chromium.launch({
    headless: true,
    args: [
      ...(isLinux ? ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] : []),
      '--disable-infobars',
      '--disable-blink-features=AutomationControlled',
      '--lang=ja-JP',
    ],
  });

  const results = [];

  try {
    for (let i = 0; i < PREFS.length; i++) {
      const r = await researchPref(browser, PREFS[i]);
      results.push(r);
      if (i < PREFS.length - 1) {
        console.log(`\n[wait] ${BETWEEN_MS / 1000}秒待機...`);
        await new Promise(res => setTimeout(res, BETWEEN_MS));
      }
    }
  } finally {
    await browser.close();
  }

  // サマリー出力
  console.log('\n\n' + '='.repeat(60));
  console.log('リサーチ結果サマリー');
  console.log('='.repeat(60));
  for (const r of results) {
    const status = r.cloudflare ? 'CF BLOCK' : r.accessible ? 'OK' : 'ERROR';
    const evLinks = r.eventLinks.map(l => l.href).join(' | ');
    console.log(`[${r.label}] ${status} | イベントリンク数:${r.eventLinks.length} | ${evLinks.substring(0, 100)}`);
    for (const ep of r.eventPages) {
      console.log(`      → ${ep.url}`);
      console.log(`         日付: ${JSON.stringify(ep.analysis.dateHits)}`);
      console.log(`         セレクタ: ${JSON.stringify(ep.analysis.selectors)}`);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
