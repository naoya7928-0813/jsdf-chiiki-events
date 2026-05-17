'use strict';
const cheerio = require('cheerio');
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());
const sleep = ms => new Promise(r => setTimeout(r, ms));

const targets = [
  // 兵庫：TOP ページからイベント URL を探す
  { pref: '兵庫_top2',       url: 'https://www.mod.go.jp/pco/hyogo/' },
  // 和歌山：カテゴリ/event ページ
  { pref: '和歌山_cat',      url: 'https://www.mod.go.jp/pco/wakayama/category/event/' },
  // 三重：個別 post ページの構造確認
  { pref: '三重_post',       url: 'https://www.mod.go.jp/pco/mie/post-9077/' },
  // 奈良：event 一覧ページの article 構造確認
  { pref: '奈良_article',    url: 'https://www.mod.go.jp/pco/nara/post-16131/' },
  // 京都：テーブル構造を全行出力
  { pref: '京都_table_full', url: 'https://www.mod.go.jp/pco/kyoto/kouhoushitsu/index.html' },
];

async function check(browser, pref, url) {
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'ja-JP',
  });
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
    const $    = cheerio.load(html, { decodeEntities: false });

    console.log('\n' + '='.repeat(60));
    console.log(`[${pref}] ${url}`);
    console.log('title:', $('title').text().trim().substring(0, 80));

    // ── 全テキスト（最初の2000文字）──
    const bodyTxt = $('body').text().replace(/\s+/g, ' ').trim();
    console.log('\n--- body text (先頭800文字) ---');
    console.log(bodyTxt.substring(0, 800));

    // ── table 全行出力 ──
    $('table').each((i, tbl) => {
      if (i >= 8) return;
      const rows = $(tbl).find('tr');
      if (rows.length < 2) return;
      console.log(`\n--- table[${i}] (${rows.length}行) ---`);
      rows.each((j, tr) => {
        const cols = $(tr).find('td,th').map((_, c) => $(c).text().trim().replace(/\s+/g, ' ').substring(0, 40)).get().join(' | ');
        console.log(`  [r${j}] ${cols}`);
      });
    });

    // ── dl/dt/dd ──
    const dls = [];
    $('dl dt').each((i, dt) => {
      if (i >= 10) return;
      dls.push(`  dt:${$(dt).text().trim().substring(0, 50)} | dd:${$(dt).next('dd').text().trim().substring(0, 80)}`);
    });
    if (dls.length) { console.log('\n--- dl/dt/dd ---'); dls.forEach(d => console.log(d)); }

    // ── 全 a リンク（イベント関連）──
    const links = [];
    $('a[href]').each((_, a) => {
      const href = $(a).attr('href') || '';
      const txt  = $(a).text().trim().replace(/\s+/g, ' ');
      if (txt.length > 4 && !/^(#|javascript|mailto)/.test(href)) {
        links.push(`  ${txt.substring(0, 50)} → ${href.substring(0, 70)}`);
      }
    });
    if (links.length) {
      console.log('\n--- links (max15) ---');
      links.slice(0, 15).forEach(l => console.log(l));
    }

  } catch (err) {
    console.log(`[ERROR] ${pref}: ${err.message.substring(0, 80)}`);
  } finally {
    await page.close();
    await ctx.close();
  }
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--lang=ja-JP'],
  });
  try {
    for (const { pref, url } of targets) {
      await check(browser, pref, url);
      await sleep(4000);
    }
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
