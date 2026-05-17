#!/usr/bin/env node
'use strict';

/**
 * 中部地本 Phase 2: イベントページ直接アクセス（withFreshContext）
 * 各ページに90秒タイムアウトでCloudflareをクリアし、HTML構造を取得する
 */

const cheerio = require('cheerio');
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const BETWEEN_MS = 12_000;

// Phase1で特定したイベントURL + 静岡の候補URL
const TARGETS = [
  { id: 'niigata',   label: '新潟', url: 'https://www.mod.go.jp/pco/niigata/HP/event-schedule.html' },
  { id: 'toyama',    label: '富山', url: 'https://www.mod.go.jp/pco/toyama/content/04-event/04-event.html' },
  { id: 'ishikawa',  label: '石川', url: 'https://www.mod.go.jp/pco/ishikawa/event29/index.html' },
  { id: 'fukui',     label: '福井', url: 'https://www.mod.go.jp/pco/fukui/contents/9-event/9-event.html' },
  { id: 'yamanashi', label: '山梨', url: 'https://www.mod.go.jp/pco/yamanashi/event.html' },
  { id: 'nagano',    label: '長野', url: 'https://www.mod.go.jp/pco/nagano/event/event.html' },
  { id: 'gifu',      label: '岐阜', url: 'https://www.mod.go.jp/pco/gifu/event/event.html' },
  // 静岡: 404だったのでホームURL候補を複数試す
  { id: 'shizuoka',  label: '静岡(home-alt1)', url: 'https://www.mod.go.jp/pco/shizuoka/index.html' },
  { id: 'shizuoka2', label: '静岡(home-alt2)', url: 'https://www.mod.go.jp/rdb/tokai/' },
  { id: 'shizuoka3', label: '静岡(home-alt3)', url: 'https://www.mod.go.jp/pco/shizuoka/event/' },
  // 愛知: JPG画像のURLを確認（OCR候補）
  { id: 'aichi',     label: '愛知(ホーム)',    url: 'https://www.mod.go.jp/pco/aichi/' },
  // 三重: WordPressイベント一覧
  { id: 'mie',       label: '三重',  url: 'https://www.mod.go.jp/pco/mie/events-page/' },
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

async function fetchWithFreshContext(browser, target) {
  const ctx  = await createContext(browser);
  const page = await ctx.newPage();
  try {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`[${target.label}] ${target.url}`);

    await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // 最大90秒でCFクリアを待つ
    try {
      await page.waitForFunction(
        () => {
          const t = document.title;
          return t.length > 0
            && !t.includes('Just a moment')
            && !t.includes('Attention Required')
            && !t.includes('しばらくお待ちください');
        },
        { timeout: 90_000 }
      );
    } catch { /* タイムアウト or チャレンジなし */ }

    await page.waitForTimeout(2000);
    const html  = await page.content();
    const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '(no title)';
    console.log(`  title: ${title.trim().substring(0, 70)}`);

    if (title.includes('404') || title.includes('Not Found')) {
      console.log(`  → 404`);
      return { id: target.id, label: target.label, status: '404' };
    }
    if (isChallengeTitle(title)) {
      console.log(`  → Cloudflare ブロック`);
      return { id: target.id, label: target.label, status: 'CF_BLOCK' };
    }

    const $ = cheerio.load(html, { decodeEntities: false });

    // セレクタ確認
    const SEL_LIST = [
      'section.subSec', 'section[id]', 'div.post h3', 'div.post',
      'article', 'h3', 'h4', 'table', 'dl', 'ul li',
      '.event', 'div[class*="event"]', '#contents',
      // WordPress系
      '.wp-block-post', '.entry-content', '.post-content', 'article.post',
      'h2.entry-title', '.wp-post-image',
    ];
    const hits = {};
    for (const sel of SEL_LIST) {
      const n = $(sel).length;
      if (n > 0) hits[sel] = n;
    }
    console.log(`  セレクタ: ${JSON.stringify(hits)}`);

    // h2・h3・h4テキスト（先頭6件ずつ）
    const texts = (sel, n) => $(sel).slice(0, n).toArray()
      .map(el => $(el).text().replace(/\s+/g, ' ').trim().substring(0, 80))
      .filter(Boolean);
    console.log(`  h2: ${JSON.stringify(texts('h2', 4))}`);
    console.log(`  h3: ${JSON.stringify(texts('h3', 6))}`);
    console.log(`  h4: ${JSON.stringify(texts('h4', 6))}`);

    // 日付パターン
    const bodyText = $('body').text().replace(/\s+/g, ' ');
    const dates = (bodyText.match(/令和\d+年\d+月\d+日|20\d\d[\/年]\d+[\/月]\d+[日]?|\d+\/\d+[（(][月火水木金土日]/g) || []).slice(0, 8);
    console.log(`  日付パターン: ${JSON.stringify(dates)}`);

    // a[href] でイベントリンク（中部サイト内のみ）
    const evLinks = [];
    $('a[href]').each((_i, el) => {
      const href = $(el).attr('href') || '';
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      if (!href.includes('mod.go.jp') && !href.startsWith('/') && !href.startsWith('.')) return;
      if (/イベント|event|見学|体験|説明会/i.test(text) || /event|ivento/i.test(href)) {
        try {
          const abs = new URL(href, target.url).href;
          evLinks.push(`${text.substring(0,20)}: ${abs}`);
        } catch {}
      }
    });
    if (evLinks.length) console.log(`  イベントリンク:\n    ${evLinks.slice(0,8).join('\n    ')}`);

    // メインコンテンツ先頭 3000文字
    const mainHtml = ($('#contents, .contents, main, .entry-content, article, body').first().html() || '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<svg[\s\S]*?<\/svg>/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .substring(0, 3000);
    console.log(`  HTML先頭3000:\n${mainHtml}`);

    return { id: target.id, label: target.label, status: 'OK', selectors: hits, dates };
  } catch (err) {
    console.log(`  エラー: ${err.message.substring(0, 100)}`);
    return { id: target.id, label: target.label, status: 'ERROR', error: err.message };
  } finally {
    await page.close();
    await ctx.close();
  }
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
    for (let i = 0; i < TARGETS.length; i++) {
      const r = await fetchWithFreshContext(browser, TARGETS[i]);
      results.push(r);
      if (i < TARGETS.length - 1) {
        console.log(`\n[wait] ${BETWEEN_MS / 1000}秒待機...`);
        await new Promise(res => setTimeout(res, BETWEEN_MS));
      }
    }
  } finally {
    await browser.close();
  }

  console.log('\n\n' + '='.repeat(60));
  console.log('Phase2 サマリー');
  console.log('='.repeat(60));
  for (const r of results) {
    const s = r.selectors ? JSON.stringify(r.selectors).substring(0, 80) : '';
    const d = r.dates    ? JSON.stringify(r.dates).substring(0, 80) : '';
    console.log(`[${r.label}] ${r.status} | sel: ${s}`);
    if (d) console.log(`  dates: ${d}`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
