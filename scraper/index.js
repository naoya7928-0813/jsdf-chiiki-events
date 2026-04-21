#!/usr/bin/env node
'use strict';

/**
 * 自衛隊地本イベント情報スクレイパー
 *
 * 使い方:
 *   node scraper/index.js          # 実際のサイトからスクレイピング
 *   node scraper/index.js --mock   # モックデータを出力（HTTPアクセスなし）
 *
 * 出力: public/data/events.json
 */

const path    = require('path');
const fs      = require('fs');
const iconv   = require('iconv-lite');
const cheerio = require('cheerio');
const { chromium } = require('playwright');

const { parseKanagawa } = require('./parsers/kanagawa');
const { parseTokyo }    = require('./parsers/tokyo');

// ── 設定 ─────────────────────────────────────────────────────
const OUTPUT_PATH = path.join(__dirname, '../public/data/events.json');

const URLS = {
  kanagawa: 'https://www.mod.go.jp/pco/kanagawa/kouho/event/event.html',
  tokyo:    'https://www.mod.go.jp/pco/tokyo/event2/index.html',
};

// ページ間の待機時間（Cloudflare/レートリミット対策）
const BETWEEN_PAGES_MS = 3000;

// ── モックデータ（--mock 時に使用） ───────────────────────────
const MOCK_DATA = {
  kanagawa: [
    { id: 'k-20260425-1', date: '2026-04-25', weekday: '土', title: '自衛官候補生 募集説明会', place: '横浜地域事務所', address: '横浜市中区山下町1-2', time: '13:30～15:30', category: '説明会', tag: '要予約', url: '', notes: '参加には事前予約が必要です。' },
    { id: 'k-20260429-1', date: '2026-04-29', weekday: '水・祝', title: '横須賀地方総監部 一般公開', place: '海上自衛隊 横須賀基地', address: '横須賀市西逸見町1丁目', time: '09:00～16:00', category: '一般公開', tag: '入場無料', url: '', notes: null },
    { id: 'k-20260505-1', date: '2026-05-05', weekday: '火・祝', title: '子ども自衛隊体験デー', place: '陸上自衛隊 武山駐屯地', address: '横須賀市御幸浜1-1', time: '10:00～15:00', category: '体験', tag: '家族向け', url: '', notes: null },
  ],
  tokyo: [
    { id: 't-20260426-1', date: '2026-04-26', weekday: '日', title: '自衛官候補生 採用試験説明会', place: '市ヶ谷駐屯地 厚生センター', address: '新宿区市谷本村町5-1', time: '10:00～12:00', category: '説明会', tag: '要予約', url: '', notes: null },
    { id: 't-20260502-1', date: '2026-05-02', weekday: '土', title: '練馬駐屯地 創立記念行事', place: '陸上自衛隊 練馬駐屯地', address: '練馬区北町4-1-1', time: '09:00～15:00', category: '記念行事', tag: '入場無料', url: '', notes: null },
  ],
};

// ── ユーティリティ ────────────────────────────────────────────

/** 現在の日本時間を "YYYY/MM/DD HH:mm" 形式で返す */
function nowJST() {
  return new Date().toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).replace(/\//g, '/').replace(',', '');
}

/** 指定ミリ秒待機 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ── Playwright ブラウザ設定 ──────────────────────────────────

/**
 * Cloudflare ボット検知を回避するためのステルス設定を施した
 * Playwright ブラウザコンテキストを返す。
 */
async function createStealthContext(browser) {
  const context = await browser.newContext({
    // 実際のChrome に近いユーザーエージェント
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport:  { width: 1280, height: 800 },
    locale:    'ja-JP',
    timezoneId: 'Asia/Tokyo',
    extraHTTPHeaders: {
      'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  // webdriver フラグ等の自動化検知を無効化
  await context.addInitScript(() => {
    // navigator.webdriver を undefined にする
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    // plugins を空でなくする（ヘッドレスブラウザの特徴を隠す）
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });
    Object.defineProperty(navigator, 'languages', {
      get: () => ['ja-JP', 'ja', 'en-US'],
    });
    // Chrome オブジェクトが存在するよう偽装
    window.chrome = { runtime: {} };
  });

  return context;
}

// ── スクレイピング本体 ───────────────────────────────────────

/**
 * 神奈川地本ページを取得・パース
 * Shift_JIS ページのため、レスポンスバイト列を iconv-lite でデコードする。
 */
async function fetchKanagawa(context) {
  const page = await context.newPage();
  try {
    console.log(`[神奈川] アクセス: ${URLS.kanagawa}`);

    // goto() の戻り値（Response）から生バイト列を取得
    const response = await page.goto(URLS.kanagawa, {
      waitUntil: 'domcontentloaded',
      timeout:   30_000,
    });

    if (!response || !response.ok()) {
      throw new Error(`HTTP ${response?.status() ?? 'no response'}`);
    }

    // Shift_JIS → UTF-8 デコード
    const buffer = await response.body();
    const html   = iconv.decode(buffer, 'Shift_JIS');

    const $ = cheerio.load(html, { decodeEntities: false });
    const events = parseKanagawa($);
    console.log(`[神奈川] ${events.length} 件取得`);
    return events;

  } finally {
    await page.close();
  }
}

/**
 * 東京地本ページを取得・パース
 * UTF-8 ページのため page.content() を使用。
 */
async function fetchTokyo(context) {
  const page = await context.newPage();
  try {
    console.log(`[東京] アクセス: ${URLS.tokyo}`);

    const response = await page.goto(URLS.tokyo, {
      waitUntil: 'domcontentloaded',
      timeout:   30_000,
    });

    if (!response || !response.ok()) {
      throw new Error(`HTTP ${response?.status() ?? 'no response'}`);
    }

    // レンダリング後の HTML を取得（Cloudflare チャレンジ通過後を確保するため少し待機）
    await page.waitForTimeout(1500);
    const html = await page.content();

    const $ = cheerio.load(html, { decodeEntities: false });
    const events = parseTokyo($);
    console.log(`[東京] ${events.length} 件取得`);
    return events;

  } finally {
    await page.close();
  }
}

// ── メイン処理 ───────────────────────────────────────────────

async function main() {
  const isMock = process.argv.includes('--mock');

  // ── モックモード ──
  if (isMock) {
    console.log('[mock] HTTP アクセスなしでサンプルデータを出力します');
    const output = { ...MOCK_DATA, updatedAt: nowJST() };
    writeOutput(output);
    console.log('[mock] 完了');
    return;
  }

  // ── 実スクレイピングモード ──
  let kanagawaEvents = [];
  let tokyoEvents    = [];

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',                        // CI 環境（Linux コンテナ）で必要
      '--disable-setuid-sandbox',
      '--disable-infobars',
      '--disable-blink-features=AutomationControlled', // 自動化フラグを隠す
      '--disable-dev-shm-usage',             // /dev/shm が小さい環境対策
      '--lang=ja-JP',
    ],
  });

  try {
    const context = await createStealthContext(browser);

    // 神奈川を取得（エラーが出ても東京の取得は継続）
    try {
      kanagawaEvents = await fetchKanagawa(context);
    } catch (err) {
      console.error(`[神奈川] 取得失敗: ${err.message}`);
    }

    // ページ間の待機（レートリミット対策）
    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    // 東京を取得（エラーが出ても神奈川の結果は保持）
    try {
      tokyoEvents = await fetchTokyo(context);
    } catch (err) {
      console.error(`[東京] 取得失敗: ${err.message}`);
    }

    await context.close();
  } finally {
    await browser.close();
  }

  // どちらも空なら既存ファイルを上書きしない
  if (kanagawaEvents.length === 0 && tokyoEvents.length === 0) {
    console.warn('[警告] 両地本ともにデータを取得できませんでした。ファイルを更新しません。');
    process.exit(1);
  }

  const output = {
    kanagawa:  kanagawaEvents,
    tokyo:     tokyoEvents,
    updatedAt: nowJST(),
  };
  writeOutput(output);
}

/** public/data/events.json に書き出す */
function writeOutput(data) {
  // ディレクトリが無ければ作成
  const dir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(data, null, 2), 'utf8');
  console.log(`[出力] ${OUTPUT_PATH}`);
  console.log(`  神奈川: ${data.kanagawa.length} 件`);
  console.log(`  東京:   ${data.tokyo.length} 件`);
  console.log(`  更新時刻: ${data.updatedAt}`);
}

// ── エントリーポイント ────────────────────────────────────────
main().catch(err => {
  console.error('[致命的エラー]', err);
  process.exit(1);
});
