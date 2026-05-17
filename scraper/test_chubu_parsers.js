#!/usr/bin/env node
'use strict';
/**
 * 中部地本パーサーの動作確認スクリプト
 * HTML を取得してパーサーを実行し、取得件数・先頭2件を表示する
 */

const cheerio  = require('cheerio');
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const { parseNiigata }   = require('./parsers/niigata');
const { parseIshikawa }  = require('./parsers/ishikawa');
const { parseFukui }     = require('./parsers/fukui');
const { parseYamanashi } = require('./parsers/yamanashi');
const { parseGifu }      = require('./parsers/gifu');
const { parseAichi }     = require('./parsers/aichi');
const { parseShizuoka }  = require('./parsers/shizuoka');
const { parseNagano }    = require('./parsers/nagano');

const TARGETS = [
  { label: '新潟',   url: 'https://www.mod.go.jp/pco/niigata/HP/event-schedule.html', parser: parseNiigata },
  { label: '石川',   url: 'https://www.mod.go.jp/pco/ishikawa/event29/index.html',    parser: parseIshikawa },
  { label: '福井',   url: 'https://www.mod.go.jp/pco/fukui/contents/9-event/9-event.html', parser: parseFukui },
  { label: '山梨',   url: 'https://www.mod.go.jp/pco/yamanashi/event.html',           parser: parseYamanashi },
  { label: '岐阜',   url: 'https://www.mod.go.jp/pco/gifu/event/event.html',          parser: parseGifu },
  { label: '静岡',   url: 'https://www.mod.go.jp/pco/sizuoka/event/index.html',       parser: parseShizuoka },
  { label: '愛知',   url: 'https://www.mod.go.jp/pco/aichi/calendar.html',            parser: parseAichi },
];

const NAGANO_ICAL = 'https://calendar.google.com/calendar/ical/naganopcohp%40gmail.com/public/basic.ics';

async function fetchHtml(ctx, label, url) {
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
    return await page.content();
  } finally {
    await page.close();
  }
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-infobars', '--disable-blink-features=AutomationControlled', '--lang=ja-JP'],
  });

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  for (const { label, url, parser } of TARGETS) {
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`[${label}] ${url}`);
    const ctx = await browser.newContext({
      userAgent:  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale:     'ja-JP',
      timezoneId: 'Asia/Tokyo',
    });
    try {
      const html = await fetchHtml(ctx, label, url);
      const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '';
      console.log(`  title: ${title.trim().substring(0, 60)}`);
      if (title.includes('404') || title.includes('Just a moment')) { console.log('  → NG'); continue; }

      const $ = cheerio.load(html, { decodeEntities: false });
      const events = parser($);
      console.log(`  → ${events.length} 件`);
      events.slice(0, 3).forEach(e => {
        console.log(`    [${e.date}(${e.weekday})] ${e.title} / ${e.place} / ${e.time}`);
      });
    } catch (err) {
      console.log(`  エラー: ${err.message.substring(0, 80)}`);
    } finally {
      await ctx.close();
    }
    await sleep(8000);
  }

  await browser.close();

  // 長野 iCal
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`[長野 iCal] ${NAGANO_ICAL}`);
  try {
    const res = await fetch(NAGANO_ICAL, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/calendar' },
    });
    if (res.ok) {
      const ics = await res.text();
      const events = parseNagano(ics);
      console.log(`  → ${events.length} 件`);
      events.slice(0, 3).forEach(e => {
        console.log(`    [${e.date}(${e.weekday})] ${e.title} / ${e.place}`);
      });
    } else {
      console.log(`  HTTP ${res.status}`);
    }
  } catch (err) {
    console.log(`  エラー: ${err.message}`);
  }

  console.log('\n[完了]');
}

main().catch(err => { console.error(err); process.exit(1); });
