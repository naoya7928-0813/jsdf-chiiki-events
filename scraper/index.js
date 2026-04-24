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

const { parseKanagawa }      = require('./parsers/kanagawa');
const { parseTokyo }         = require('./parsers/tokyo');
const { parseSaitama }       = require('./parsers/saitama');
const { parseGunma }         = require('./parsers/gunma');
const { parseIbaraki }       = require('./parsers/ibaraki');
const { parseChiba }         = require('./parsers/chiba');
const { parseTochigiImages } = require('./parsers/tochigi');
const { toHalfWidth, reiwaToAD, padTwo, isPast, guessCategory, guessTag } = require('./parsers/utils');

// ── 設定 ─────────────────────────────────────────────────────
const OUTPUT_PATH = path.join(__dirname, '../public/data/events.json');

const URLS = {
  kanagawa: 'https://www.mod.go.jp/pco/kanagawa/kouho/event/event.html',
  tokyo:    'https://www.mod.go.jp/pco/tokyo/event2/index.html',
  saitama:  'https://www.mod.go.jp/pco/saitama/event/',
  gunma:    'https://www.mod.go.jp/pco/gunma/event.html',
  tochigi:  'https://www.mod.go.jp/pco/tochigi/',
  ibaraki:  'https://www.mod.go.jp/pco/ibaraki/event.html',
  chiba:    'https://www.mod.go.jp/pco/chiba/event.html',
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
  saitama: [
    { id: 's-20260519-1', pref: 'saitama', date: '2026-05-19', weekday: '火', title: '陸上自衛隊 朝霞駐屯地 見学会', place: '陸上自衛隊 朝霞駐屯地', address: '', time: '10:00～12:00', category: '見学', tag: '要予約', url: '', notes: null },
  ],
  gunma: [
    { id: 'gu-20260601-1', pref: 'gunma', date: '2026-06-01', weekday: '月', title: '陸上自衛隊 相馬原駐屯地 見学会', place: '相馬原駐屯地', address: '', time: '10:00～12:00', category: '見学', tag: '要予約', url: '', notes: null },
  ],
  tochigi: [],
  ibaraki: [
    { id: 'ib-20260601-1', pref: 'ibaraki', date: '2026-06-01', weekday: '月', title: '土浦駐屯地 見学会', place: '陸上自衛隊 土浦駐屯地', address: '', time: '10:00～12:00', category: '見学', tag: '要予約', url: '', notes: null },
  ],
  chiba: [
    { id: 'cb-20260601-1', pref: 'chiba', date: '2026-06-01', weekday: '月', title: '習志野駐屯地 見学会', place: '陸上自衛隊 習志野駐屯地', address: '', time: '10:00～12:00', category: '見学', tag: '要予約', url: '', notes: null },
  ],
};

// ── OCR（Claude Haiku による画像解析） ─────────────────────────

const OCR_PROMPT = `この自衛隊イベントのポスター画像から情報を抽出してください。
以下のJSONのみを返してください（説明文不要）。該当情報がない項目はnullにしてください。
{
  "title": "ポスターに書かれた正確なイベント名",
  "time": "開催時間（例: 10:00～16:00）",
  "ageRequirement": "参加対象年齢（例: 18歳〜32歳未満）",
  "deadline": "応募締切日（例: 4月24日（金））",
  "notes": "実施内容・参加条件・注意事項など（箇条書きをそのまま）"
}`;

/**
 * ポスター画像URLを受け取り、Claude Haiku でOCRしてJSON を返す。
 * ANTHROPIC_API_KEY が未設定の場合は null を返す（OCRスキップ）。
 */
async function ocrImage(imageUrl) {
  if (!process.env.ANTHROPIC_API_KEY || !imageUrl) return null;

  try {
    // 画像をダウンロード
    const imgRes = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer':    'https://www.mod.go.jp/',
      },
    });
    if (!imgRes.ok) {
      console.warn(`[OCR] 画像取得失敗 (${imgRes.status}): ${imageUrl}`);
      return null;
    }

    const buf       = await imgRes.arrayBuffer();
    const base64    = Buffer.from(buf).toString('base64');
    const mimeType  = (imgRes.headers.get('content-type') || 'image/png').split(';')[0].trim();

    // Claude Haiku API 呼び出し（SDK不要・native fetch）
    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'x-api-key':         process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{
          role:    'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
            { type: 'text',  text: OCR_PROMPT },
          ],
        }],
      }),
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.warn(`[OCR] API エラー (${apiRes.status}): ${errText.slice(0, 100)}`);
      return null;
    }

    const apiJson = await apiRes.json();
    const text    = apiJson.content?.[0]?.text ?? '';

    // レスポンスからJSON部分を抽出
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);

  } catch (err) {
    console.warn(`[OCR] ${imageUrl} → ${err.message}`);
    return null;
  }
}

/**
 * OCR で生じやすい誤認識を修正する。
 * 醍 → 第（画数が近く混同されやすい）
 */
function fixOcrTitle(title) {
  if (!title) return title;
  return title.replace(/醍/g, '第');
}

// 栃木専用: 全イベント情報（日付・場所含む）を画像から抽出するプロンプト
const OCR_PROMPT_FULL = `この自衛隊イベントのポスター画像から情報を抽出してください。
以下のJSONのみを返してください（説明文不要）。該当情報がない項目はnullにしてください。
{
  "title": "ポスターに書かれた正確なイベント名",
  "date": "開催日（「令和X年Y月Z日（曜日）」の形式で。例: 令和8年5月19日（火））",
  "place": "開催場所・見学先の名称",
  "time": "開催時間（例: 10:00～16:00）",
  "ageRequirement": "参加対象・応募資格（例: 18歳～32歳未満）",
  "deadline": "応募締切日（例: 4月24日（金））",
  "notes": "実施内容・参加条件・注意事項"
}`;

/**
 * 画像 1 枚から全イベント情報（日付・場所含む）を OCR する（栃木専用）。
 */
async function ocrImageFull(imageUrl) {
  if (!process.env.ANTHROPIC_API_KEY || !imageUrl) return null;
  try {
    const imgRes = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer':    'https://www.mod.go.jp/',
      },
    });
    if (!imgRes.ok) { console.warn(`[OCR-FULL] 画像取得失敗 (${imgRes.status}): ${imageUrl}`); return null; }
    const buf      = await imgRes.arrayBuffer();
    const base64   = Buffer.from(buf).toString('base64');
    const mimeType = (imgRes.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    const apiRes   = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'x-api-key':         process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', max_tokens: 512,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
          { type: 'text',  text: OCR_PROMPT_FULL },
        ] }],
      }),
    });
    if (!apiRes.ok) { console.warn(`[OCR-FULL] API エラー (${apiRes.status})`); return null; }
    const apiJson   = await apiRes.json();
    const text      = apiJson.content?.[0]?.text ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.warn(`[OCR-FULL] ${imageUrl} → ${err.message}`);
    return null;
  }
}

/**
 * OCR結果をイベントオブジェクトにマージする。
 * - title: OCR が取得できた場合のみ上書き
 * - ageRequirement / deadline: OCR 優先、元データが既にあれば保持
 * - notes: OCR と元データを結合
 */
function mergeOcr(ev, ocr) {
  if (!ocr) return ev;
  return {
    ...ev,
    title:          (ocr.title          && fixOcrTitle(ocr.title.trim())) || ev.title,
    time:           (ocr.time           && ocr.time.trim())           || ev.time  || '',
    ageRequirement: (ocr.ageRequirement && ocr.ageRequirement.trim()) || ev.ageRequirement || null,
    deadline:       (ocr.deadline       && ocr.deadline.trim())       || ev.deadline       || null,
    notes: [ev.notes, ocr.notes].filter(Boolean).join('\n') || null,
  };
}

/**
 * イベント配列に対して順番に OCR を実行し、結果をマージして返す。
 * 失敗したイベントは元データのまま保持する。
 */
async function enrichWithOcr(events) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('[OCR] ANTHROPIC_API_KEY 未設定のためスキップ');
    return events;
  }

  console.log(`[OCR] ${events.filter(e => e.imageUrl).length} 件の画像を処理します`);
  const results = [];

  for (const ev of events) {
    if (!ev.imageUrl) {
      results.push(ev);
      continue;
    }

    console.log(`[OCR] ${ev.title} (${ev.date})`);
    const ocr = await ocrImage(ev.imageUrl);
    if (ocr) console.log(`  → title: ${ocr.title ?? '(変更なし)'}`);
    results.push(mergeOcr(ev, ocr));

    // API レートリミット対策
    await sleep(500);
  }

  return results;
}

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
    userAgent:  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport:   { width: 1280, height: 800 },
    locale:     'ja-JP',
    timezoneId: 'Asia/Tokyo',
    extraHTTPHeaders: {
      'Accept-Language':           'ja,en-US;q=0.9,en;q=0.8',
      'Accept':                    'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Upgrade-Insecure-Requests': '1',
      'sec-ch-ua':                 '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'sec-ch-ua-mobile':          '?0',
      'sec-ch-ua-platform':        '"Windows"',
    },
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver',  { get: () => undefined });
    Object.defineProperty(navigator, 'plugins',    { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages',  { get: () => ['ja-JP', 'ja', 'en-US'] });
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
  console.log(`[神奈川] アクセス: ${URLS.kanagawa}`);

  // ── Playwright で試みる（Cloudflare チャレンジを通過させる）──
  const page = await context.newPage();
  try {
    await page.goto(URLS.kanagawa, {
      waitUntil: 'networkidle',   // Cloudflare JS チャレンジ完了まで待つ
      timeout:   60_000,
    });

    // チャレンジ後の追加待機
    await page.waitForTimeout(3000);

    // page.content() はブラウザが描画した UTF-8 HTML を返す（Shift_JIS 変換不要）
    const html = await page.content();

    // Cloudflare ブロックページか判定（H3 が存在するか確認）
    const hasH3 = /<h3/i.test(html);
    if (hasH3) {
      const $ = cheerio.load(html, { decodeEntities: false });
      const events = parseKanagawa($);
      console.log(`[神奈川] ${events.length} 件取得 (Playwright)`);
      return events;
    }
    console.warn('[神奈川] Playwright: コンテンツなし（Cloudflare ブロック？）→ fetch にフォールバック');
  } catch (err) {
    console.warn(`[神奈川] Playwright 失敗: ${err.message} → fetch にフォールバック`);
  } finally {
    await page.close();
  }

  // ── native fetch + iconv フォールバック ──
  const res = await fetch(URLS.kanagawa, {
    headers: {
      'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      'Referer':         'https://www.mod.go.jp/',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buffer = await res.arrayBuffer();
  const html   = iconv.decode(Buffer.from(buffer), 'Shift_JIS');
  const $ = cheerio.load(html, { decodeEntities: false });
  const events = parseKanagawa($);
  console.log(`[神奈川] ${events.length} 件取得 (fetch fallback)`);
  return events;
}

/**
 * 東京地本ページを取得・パース
 * Playwright が 403 になった場合は native fetch にフォールバックする。
 */
async function fetchTokyo(context) {
  console.log(`[東京] アクセス: ${URLS.tokyo}`);

  // ── Playwright で試みる ──
  const page = await context.newPage();
  try {
    const response = await page.goto(URLS.tokyo, {
      waitUntil: 'domcontentloaded',
      timeout:   30_000,
    });

    if (response && response.ok()) {
      await page.waitForTimeout(2000);
      const html = await page.content();
      const $ = cheerio.load(html, { decodeEntities: false });
      const events = parseTokyo($);
      console.log(`[東京] ${events.length} 件取得 (Playwright)`);
      return events;
    }
    console.warn(`[東京] Playwright: HTTP ${response?.status()} → fetch にフォールバック`);
  } catch (err) {
    console.warn(`[東京] Playwright 失敗: ${err.message} → fetch にフォールバック`);
  } finally {
    await page.close();
  }

  // ── native fetch フォールバック ──
  const res = await fetch(URLS.tokyo, {
    headers: {
      'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      'Referer':         'https://www.mod.go.jp/',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html, { decodeEntities: false });
  const events = parseTokyo($);
  console.log(`[東京] ${events.length} 件取得 (fetch fallback)`);
  return events;
}

/**
 * 埼玉地本ページを取得・パース
 */
async function fetchSaitama(context) {
  return fetchHtmlPref(context, '埼玉', URLS.saitama, parseSaitama);
}

/** 共通: HTML ページを Playwright → fetch の順で取得してパーサーに渡す */
async function fetchHtmlPref(context, prefLabel, url, parserFn) {
  console.log(`[${prefLabel}] アクセス: ${url}`);
  const page = await context.newPage();
  try {
    // domcontentloaded: Cloudflare チャレンジが 403 で来ても Playwright は
    // ブラウザとしてチャレンジを実行→実際のページへリダイレクトする。
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // Cloudflare チャレンジのタイトル "Just a moment..." が消えるまで最大 15 秒待つ
    try {
      await page.waitForFunction(
        () => !document.title.includes('Just a moment') && !document.title.includes('Attention Required'),
        { timeout: 15_000 }
      );
    } catch { /* チャレンジなし or タイムアウト → そのまま続行 */ }

    await page.waitForTimeout(2000);

    const html   = await page.content();
    const title  = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '(no title)';
    console.log(`[${prefLabel}] page title: ${title.trim().substring(0, 70)}`);
    const $      = cheerio.load(html, { decodeEntities: false });
    const subSec = $('section.subSec').length;
    const postH3 = $('div.post h3').length;
    console.log(`[${prefLabel}] selectors: section.subSec=${subSec} div.post-h3=${postH3}`);
    const events = parserFn($);
    console.log(`[${prefLabel}] ${events.length} 件取得 (Playwright)`);
    return events;
  } catch (err) {
    console.warn(`[${prefLabel}] Playwright 失敗: ${err.message} → fetch にフォールバック`);
  } finally {
    await page.close();
  }

  const res = await fetch(url, {
    headers: {
      'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      'Referer':         'https://www.mod.go.jp/',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html   = await res.text();
  const $      = cheerio.load(html, { decodeEntities: false });
  const events = parserFn($);
  console.log(`[${prefLabel}] ${events.length} 件取得 (fetch fallback)`);
  return events;
}

const fetchGunma   = (ctx) => fetchHtmlPref(ctx, '群馬', URLS.gunma,   parseGunma);
const fetchIbaraki = (ctx) => fetchHtmlPref(ctx, '茨城', URLS.ibaraki, parseIbaraki);
const fetchChiba   = (ctx) => fetchHtmlPref(ctx, '千葉', URLS.chiba,   parseChiba);

/**
 * 栃木地本ページを取得し、JPG ポスターを OCR してイベント一覧を返す。
 * ANTHROPIC_API_KEY 未設定の場合は空配列を返す（OCR スキップ）。
 */
async function fetchTochigi(context) {
  console.log(`[栃木] アクセス: ${URLS.tochigi}`);

  const page = await context.newPage();
  let imageUrls = [];
  try {
    await page.goto(URLS.tochigi, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    try {
      await page.waitForFunction(
        () => !document.title.includes('Just a moment') && !document.title.includes('Attention Required'),
        { timeout: 15_000 }
      );
    } catch { /* チャレンジなし or タイムアウト */ }
    await page.waitForTimeout(2000);
    const html = await page.content();
    const $    = cheerio.load(html, { decodeEntities: false });
    imageUrls  = parseTochigiImages($);
    console.log(`[栃木] ${imageUrls.length} 件の画像を検出`);
  } catch (err) {
    console.warn(`[栃木] Playwright 失敗: ${err.message}`);
  } finally {
    await page.close();
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('[栃木] ANTHROPIC_API_KEY 未設定のため OCR スキップ');
    return [];
  }
  if (imageUrls.length === 0) return [];

  const events = [];
  let idx = 0;
  for (const imgUrl of imageUrls) {
    console.log(`[栃木 OCR] ${imgUrl}`);
    const ocr = await ocrImageFull(imgUrl);
    if (!ocr) continue;

    const rawDate = toHalfWidth((ocr.date || '').replace(/\s+/g, ' ').trim());
    const dtMatch = rawDate.match(/令和(\d+)年(\d+)月(\d+)日[（(]([月火水木金土日祝・]+)[）)]/);
    if (!dtMatch) { console.warn(`[栃木 OCR] 日付パース失敗: "${ocr.date}"`); continue; }

    const year    = reiwaToAD(parseInt(dtMatch[1], 10));
    const month   = parseInt(dtMatch[2], 10);
    const day     = parseInt(dtMatch[3], 10);
    const weekday = dtMatch[4];
    const dateStr = `${year}-${padTwo(month)}-${padTwo(day)}`;
    if (isPast(dateStr)) continue;

    const title = ocr.title ? fixOcrTitle(ocr.title.trim()) : '';
    if (!title) continue;

    events.push({
      id:             `tc-${dateStr.replace(/-/g, '')}-${++idx}`,
      pref:           'tochigi',
      date:           dateStr,
      weekday,
      title,
      place:          (ocr.place          || '').trim(),
      address:        '',
      time:           (ocr.time           || '').trim(),
      category:       guessCategory(toHalfWidth(title)),
      tag:            guessTag(title),
      url:            '',
      notes:          ocr.notes          || null,
      ageRequirement: ocr.ageRequirement || null,
      deadline:       ocr.deadline       || null,
      imageUrl:       '',  // OCR 済みのため再処理不要
    });

    await sleep(500);
  }

  console.log(`[栃木] ${events.length} 件取得 (OCR)`);
  return events.sort((a, b) => a.date.localeCompare(b.date));
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
  let saitamaEvents  = [];
  let gunmaEvents    = [];
  let tochigiEvents  = [];
  let ibarakiEvents  = [];
  let chibaEvents    = [];
  let kanagawaError  = false;
  let tokyoError     = false;
  let saitamaError   = false;
  let gunmaError     = false;
  let tochigiError   = false;
  let ibarakiError   = false;
  let chibaError     = false;

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

    try {
      kanagawaEvents = await fetchKanagawa(context);
    } catch (err) {
      console.error(`[神奈川] 取得失敗: ${err.message}`);
      kanagawaError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      tokyoEvents = await fetchTokyo(context);
    } catch (err) {
      console.error(`[東京] 取得失敗: ${err.message}`);
      tokyoError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      saitamaEvents = await fetchSaitama(context);
    } catch (err) {
      console.error(`[埼玉] 取得失敗: ${err.message}`);
      saitamaError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      gunmaEvents = await fetchGunma(context);
    } catch (err) {
      console.error(`[群馬] 取得失敗: ${err.message}`);
      gunmaError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      ibarakiEvents = await fetchIbaraki(context);
    } catch (err) {
      console.error(`[茨城] 取得失敗: ${err.message}`);
      ibarakiError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      chibaEvents = await fetchChiba(context);
    } catch (err) {
      console.error(`[千葉] 取得失敗: ${err.message}`);
      chibaError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      tochigiEvents = await fetchTochigi(context);
    } catch (err) {
      console.error(`[栃木] 取得失敗: ${err.message}`);
      tochigiError = true;
    }

    await context.close();
  } finally {
    await browser.close();
  }

  // 全地本エラーの場合のみ終了
  if (kanagawaError && tokyoError && saitamaError && gunmaError && ibarakiError && chibaError && tochigiError) {
    console.warn('[警告] 全地本ともに取得エラーが発生しました。ファイルを更新しません。');
    process.exit(1);
  }

  // エラーになった地本は既存 events.json のデータを引き継ぐ（空配列で上書きしない）
  let prev = {};
  try { prev = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8')); } catch { /* ファイル未存在は無視 */ }

  const fallback = (flag, label, events, key) => {
    if (!flag) return events;
    console.warn(`[${label}] エラーのため前回データを維持します`);
    return prev[key] ?? [];
  };

  kanagawaEvents = fallback(kanagawaError, '神奈川', kanagawaEvents, 'kanagawa');
  tokyoEvents    = fallback(tokyoError,    '東京',   tokyoEvents,    'tokyo');
  saitamaEvents  = fallback(saitamaError,  '埼玉',   saitamaEvents,  'saitama');
  gunmaEvents    = fallback(gunmaError,    '群馬',   gunmaEvents,    'gunma');
  ibarakiEvents  = fallback(ibarakiError,  '茨城',   ibarakiEvents,  'ibaraki');
  chibaEvents    = fallback(chibaError,    '千葉',   chibaEvents,    'chiba');
  tochigiEvents  = fallback(tochigiError,  '栃木',   tochigiEvents,  'tochigi');

  // ── OCR でイベント内容を補完（imageUrl がある HTML パーサー結果のみ対象） ──
  tokyoEvents    = await enrichWithOcr(tokyoEvents);
  saitamaEvents  = await enrichWithOcr(saitamaEvents);
  gunmaEvents    = await enrichWithOcr(gunmaEvents);
  ibarakiEvents  = await enrichWithOcr(ibarakiEvents);
  chibaEvents    = await enrichWithOcr(chibaEvents);
  // tochigiEvents は fetchTochigi 内で OCR 済み（imageUrl が空なので enrichWithOcr は無害）

  // imageUrl は最終出力に含めない（内部用フィールド）
  const strip = ev => { const { imageUrl: _, ...rest } = ev; return rest; };

  const output = {
    kanagawa: kanagawaEvents.map(strip),
    tokyo:    tokyoEvents.map(strip),
    saitama:  saitamaEvents.map(strip),
    gunma:    gunmaEvents.map(strip),
    tochigi:  tochigiEvents.map(strip),
    ibaraki:  ibarakiEvents.map(strip),
    chiba:    chibaEvents.map(strip),
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
  console.log(`  神奈川: ${(data.kanagawa ?? []).length} 件`);
  console.log(`  東京:   ${(data.tokyo    ?? []).length} 件`);
  console.log(`  埼玉:   ${(data.saitama  ?? []).length} 件`);
  console.log(`  群馬:   ${(data.gunma    ?? []).length} 件`);
  console.log(`  栃木:   ${(data.tochigi  ?? []).length} 件`);
  console.log(`  茨城:   ${(data.ibaraki  ?? []).length} 件`);
  console.log(`  千葉:   ${(data.chiba    ?? []).length} 件`);
  console.log(`  更新時刻: ${data.updatedAt}`);
}

// ── エントリーポイント ────────────────────────────────────────
main().catch(err => {
  console.error('[致命的エラー]', err);
  process.exit(1);
});
