#!/usr/bin/env node
'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const cheerio = require('cheerio');
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const sleep = ms => new Promise(r => setTimeout(r, ms));

const PAGES = [
  // 東京 個別事務所
  { label: '東京/大田出張所',      url: 'https://www.mod.go.jp/pco/tokyo/oota/event.html' },
  { label: '東京/渋谷募集案内所',   url: 'https://www.mod.go.jp/pco/tokyo/shibuya/index.html' },
  { label: '東京/町田募集案内所',   url: 'https://www.mod.go.jp/pco/tokyo/machida/index.html' },
  { label: '東京/国分寺募集案内所', url: 'https://www.mod.go.jp/pco/tokyo/kokubunji/index.html' },
  { label: '東京/説明会',          url: 'https://www.mod.go.jp/pco/tokyo/setumeikai/index.html' },
  // 神奈川 各事務所
  { label: '神奈川/横須賀地域事務所',  url: 'https://www.mod.go.jp/pco/kanagawa/mado/yokosuka/yokosuka.html' },
  { label: '神奈川/厚木募集案内所',    url: 'https://www.mod.go.jp/pco/kanagawa/mado/atugi/atugi.html' },
  { label: '神奈川/上大岡募集案内所',  url: 'https://www.mod.go.jp/pco/kanagawa/mado/kamiooka/kamiooka.html' },
  { label: '神奈川/川崎出張所',       url: 'https://www.mod.go.jp/pco/kanagawa/mado/kawasaki/kawasaki.html' },
  { label: '神奈川/市ヶ尾募集案内所', url: 'https://www.mod.go.jp/pco/kanagawa/mado/ichigao/ichigao.html' },
  { label: '神奈川/溝の口募集案内所', url: 'https://www.mod.go.jp/pco/kanagawa/mado/mizo/mizo.html' },
  { label: '神奈川/藤沢募集案内所',   url: 'https://www.mod.go.jp/pco/kanagawa/mado/fujisawa/fujisawa.html' },
  { label: '神奈川/横浜中央募集案内所',url: 'https://www.mod.go.jp/pco/kanagawa/mado/chuou/chuou.html' },
  { label: '神奈川/横浜出張所',       url: 'https://www.mod.go.jp/pco/kanagawa/mado/yokohama/yokohama.html' },
  { label: '神奈川/平塚地域事務所',   url: 'https://www.mod.go.jp/pco/kanagawa/mado/hiratuka/hiratuka.html' },
  { label: '神奈川/相模原地域事務所', url: 'https://www.mod.go.jp/pco/kanagawa/mado/sagami/sagami.html' },
  { label: '神奈川/小田原地域事務所', url: 'https://www.mod.go.jp/pco/kanagawa/mado/odawara/odawara.html' },
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  for (const { label, url } of PAGES) {
    const ctx  = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', locale: 'ja-JP' });
    const page = await ctx.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25_000 });
      const html = await page.content();
      const $    = cheerio.load(html);

      // テキストを圧縮
      const bodyText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 3000);

      // 日付を抽出
      const dates = (bodyText.match(/令和\d+年\d+月\d+日[（(]?[月火水木金土日]?[）)]?|\d{4}年\d+月\d+日|\d+月\d+日[（(][月火水木金土日][）)]/g) || []);
      const futureDates = dates.filter(d => {
        const m = d.match(/(\d+)年(\d+)月(\d+)日/) || d.match(/令和(\d+)年(\d+)月(\d+)日/);
        if (!m) return true;
        const y = d.startsWith('令和') ? 2018 + parseInt(m[1]) : parseInt(m[1]);
        const mo = parseInt(m[2]), day = parseInt(m[3]);
        return new Date(y, mo-1, day) >= new Date();
      });

      // PDFリンク
      const pdfs = [];
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || '';
        if (/\.pdf/i.test(href)) {
          let abs;
          try { abs = new URL(href, url).href; } catch { return; }
          pdfs.push({ text: $(el).text().trim().slice(0,40), url: abs });
        }
      });

      // イベント関連テキスト（説明会・体験・見学・公開を含む行）
      const eventLines = bodyText.split(/[。.！\n]/).filter(l =>
        /説明会|体験|見学|公開|イベント|募集|参加|申込|開催/.test(l) && l.length > 10
      ).slice(0, 5);

      console.log(`\n【${label}】`);
      console.log(`  URL: ${url}`);
      if (futureDates.length > 0) console.log(`  📅 将来日付: ${[...new Set(futureDates)].slice(0,5).join(' / ')}`);
      else console.log(`  📅 将来日付: なし`);
      if (pdfs.length > 0) console.log(`  📄 PDF: ${pdfs.slice(0,3).map(p => `"${p.text}"`).join(', ')}`);
      if (eventLines.length > 0) console.log(`  📌 イベント関連: ${eventLines[0].trim().slice(0,80)}`);

    } catch (e) {
      console.log(`\n【${label}】エラー: ${e.message.slice(0,60)}`);
    } finally {
      await ctx.close();
    }
    await sleep(4000);
  }
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
