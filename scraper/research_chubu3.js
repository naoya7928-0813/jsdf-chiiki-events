#!/usr/bin/env node
'use strict';

/**
 * 中部地本 Phase 3: イベントHTML詳細取得
 * パーサー実装に必要な "イベント1件分のHTML断片" を集める
 */

const cheerio = require('cheerio');
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const BETWEEN_MS = 12_000;

const TARGETS = [
  { id: 'niigata',   label: '新潟', url: 'https://www.mod.go.jp/pco/niigata/HP/event-schedule.html' },
  { id: 'ishikawa',  label: '石川', url: 'https://www.mod.go.jp/pco/ishikawa/event29/index.html' },
  { id: 'fukui',     label: '福井', url: 'https://www.mod.go.jp/pco/fukui/contents/9-event/9-event.html' },
  { id: 'yamanashi', label: '山梨', url: 'https://www.mod.go.jp/pco/yamanashi/event.html' },
  { id: 'gifu',      label: '岐阜', url: 'https://www.mod.go.jp/pco/gifu/event/event.html' },
  { id: 'aichi',     label: '愛知', url: 'https://www.mod.go.jp/pco/aichi/' },
  // 愛知の専用イベントページ候補
  { id: 'aichi_ev',  label: '愛知(event/)', url: 'https://www.mod.go.jp/pco/aichi/event/' },
  { id: 'aichi_cal', label: '愛知(calendar)', url: 'https://www.mod.go.jp/pco/aichi/calendar.html' },
  // 富山: JPGページ全体を確認
  { id: 'toyama',    label: '富山', url: 'https://www.mod.go.jp/pco/toyama/content/04-event/04-event.html' },
  // 長野: iCalフィードを直接試す
  { id: 'nagano_ical', label: '長野(iCal)', url: 'https://calendar.google.com/calendar/ical/naganopcohp%40gmail.com/public/basic.ics' },
];

async function createContext(browser) {
  const ctx = await browser.newContext({
    userAgent:  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport:   { width: 1280, height: 800 },
    locale:     'ja-JP',
    timezoneId: 'Asia/Tokyo',
    extraHTTPHeaders: {
      'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
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
  return t.includes('しばらくお待ちください') || t.includes('Just a moment');
}

async function fetchDetail(browser, target) {
  const ctx  = await createContext(browser);
  const page = await ctx.newPage();
  try {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`[${target.label}] ${target.url}`);

    await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    try {
      await page.waitForFunction(
        () => { const t = document.title; return t.length > 0 && !t.includes('Just a moment') && !t.includes('しばらくお待ちください'); },
        { timeout: 90_000 }
      );
    } catch {}
    await page.waitForTimeout(2000);

    const html  = await page.content();
    const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '';
    console.log(`  title: ${title.trim().substring(0, 60)}`);
    if (title.includes('404') || isChallengeTitle(title)) { console.log('  → NG'); return; }

    const $ = cheerio.load(html, { decodeEntities: false });
    const clean = s => (s || '').replace(/<!--[\s\S]*?-->/g,'').replace(/<svg[\s\S]*?<\/svg>/gi,'').replace(/\s{2,}/g,' ').trim();

    if (target.id === 'niigata') {
      // h2カテゴリ別 + tableの中身
      console.log('\n--- h2要素 ---');
      $('h2').each((i, el) => console.log(`  [${i}] ${$(el).text().trim()}`));
      console.log('\n--- tableの先頭3件 ---');
      $('table').slice(0, 3).each((i, el) => {
        console.log(`\ntable[${i}]:\n${clean($(el).html()).substring(0, 1500)}`);
      });
      console.log('\n--- div[class*="event"]の内容 ---');
      $('div[class*="event"]').each((i, el) => {
        console.log(`\n.event[${i}] class="${$(el).attr('class')}":\n${clean($(el).html()).substring(0, 1000)}`);
      });
    }

    if (target.id === 'ishikawa') {
      console.log('\n--- .event div の内容 ---');
      $('.event').each((i, el) => {
        console.log(`\n.event[${i}]:\n${clean($(el).html()).substring(0, 2000)}`);
      });
      console.log('\n--- メインコンテンツ全体 ---');
      const main = clean($('main, #main, .main, body').first().html()).substring(0, 3000);
      console.log(main);
    }

    if (target.id === 'fukui') {
      console.log('\n--- h2 + 直後の要素 ---');
      $('h2').each((i, h2el) => {
        const h2text = $(h2el).text().trim();
        const next = $(h2el).next();
        console.log(`\nh2[${i}]: "${h2text}"`);
        console.log(`  次の要素 <${next[0]?.tagName || 'none'}> class="${next.attr('class') || ''}":`);
        console.log(`  ${clean(next.html()).substring(0, 600)}`);
      });
      console.log('\n--- dl の内容（先頭3件） ---');
      $('dl').slice(0, 3).each((i, el) => {
        console.log(`\ndl[${i}]:\n${clean($(el).html()).substring(0, 600)}`);
      });
    }

    if (target.id === 'yamanashi') {
      console.log('\n--- div[class*="event"] の内容（先頭4件） ---');
      $('div[class*="event"]').slice(0, 4).each((i, el) => {
        console.log(`\n.event[${i}] class="${$(el).attr('class')}":\n${clean($(el).html()).substring(0, 1200)}`);
      });
    }

    if (target.id === 'gifu') {
      console.log('\n--- h2 + table の対応関係 ---');
      $('h2').each((i, h2el) => {
        const h2text = $(h2el).text().trim();
        // 次のtableを探す
        let $next = $(h2el).next();
        let table = null;
        for (let k = 0; k < 5 && $next.length; k++) {
          if ($next.is('table')) { table = $next; break; }
          if ($next.find('table').length) { table = $next.find('table').first(); break; }
          $next = $next.next();
        }
        console.log(`\nh2[${i}]: "${h2text}"`);
        if (table) console.log(`  table:\n${clean(table.html()).substring(0, 800)}`);
        else console.log('  (tableなし)');
      });
    }

    if (target.id === 'aichi' || target.id === 'aichi_ev' || target.id === 'aichi_cal') {
      console.log('\n--- section[id] の内容（先頭3件） ---');
      $('section[id]').slice(0, 3).each((i, el) => {
        console.log(`\nsection#${$(el).attr('id')}:\n${clean($(el).html()).substring(0, 1000)}`);
      });
      console.log('\n--- h4 の内容と周辺要素 ---');
      $('h4').slice(0, 6).each((i, el) => {
        const h4text = $(el).text().replace(/\s+/g,' ').trim();
        const parent = $(el).parent();
        console.log(`\nh4[${i}]: "${h4text.substring(0,60)}"`);
        console.log(`  parent <${parent[0]?.tagName || 'none'}> class="${parent.attr('class') || ''}":`);
        console.log(`  ${clean(parent.html()).substring(0, 600)}`);
      });
    }

    if (target.id === 'toyama') {
      console.log('\n--- div.event の内容 ---');
      $('div[class*="event"]').each((i, el) => {
        console.log(`\n.event[${i}] class="${$(el).attr('class')}":\n${clean($(el).html()).substring(0, 1500)}`);
      });
      console.log('\n--- 画像リンク（.jpg） ---');
      $('a[href$=".jpg"], img[src$=".jpg"]').each((i, el) => {
        const src = $(el).attr('href') || $(el).attr('src');
        if (src && src.includes('event')) console.log(`  ${src}`);
      });
    }

    if (target.id === 'nagano_ical') {
      // iCalはHTMLでないのでrawで取得
      console.log('\n--- iCal フィード (先頭2000文字) ---');
      console.log(html.substring(0, 2000));
    }

  } catch (err) {
    console.log(`  エラー: ${err.message.substring(0, 100)}`);
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
  try {
    for (let i = 0; i < TARGETS.length; i++) {
      await fetchDetail(browser, TARGETS[i]);
      if (i < TARGETS.length - 1) {
        console.log(`\n[wait] ${BETWEEN_MS/1000}秒待機...`);
        await new Promise(r => setTimeout(r, BETWEEN_MS));
      }
    }
  } finally {
    await browser.close();
  }
  console.log('\n\n[Phase3完了]');
}

main().catch(err => { console.error(err); process.exit(1); });
