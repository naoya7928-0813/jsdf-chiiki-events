#!/usr/bin/env node
'use strict';

// scraper/.env から環境変数を読み込む（SITE_URL, NOTIFY_SECRET）
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

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

const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const { parseKanagawa }      = require('./parsers/kanagawa');
const { parseTokyo }         = require('./parsers/tokyo');
const { parseSaitama }       = require('./parsers/saitama');
const { parseGunma }         = require('./parsers/gunma');
const { parseIbaraki }       = require('./parsers/ibaraki');
const { parseChiba }         = require('./parsers/chiba');
const { parseTochigiImages } = require('./parsers/tochigi');
// 北海道地本
const { parseSapporoPage }   = require('./parsers/sapporo');
const { parseAsahikawa }     = require('./parsers/asahikawa');
const { parseObihiro }       = require('./parsers/obihiro');
const { parseHakodate }      = require('./parsers/hakodate');
// 東北地本
const { parseMiyagi }        = require('./parsers/miyagi');
const { parseAomori }        = require('./parsers/aomori');
const { parseIwate }         = require('./parsers/iwate');
const { parseYamagata }      = require('./parsers/yamagata');
const { parseFukushima }     = require('./parsers/fukushima');
const { parseAkita }         = require('./parsers/akita');
// 中部地本
const { parseNiigata }       = require('./parsers/niigata');
const { parseIshikawa }      = require('./parsers/ishikawa');
const { parseFukui }         = require('./parsers/fukui');
const { parseYamanashi }     = require('./parsers/yamanashi');
const { parseGifu }          = require('./parsers/gifu');
const { parseAichi, parseAichiDetail } = require('./parsers/aichi');
const { parseShizuoka }      = require('./parsers/shizuoka');
const { parseToyamaImages }  = require('./parsers/toyama');
const { parseNagano }        = require('./parsers/nagano');
// 近畿地本
const { parseKyoto }                          = require('./parsers/kyoto');
const { parseOsaka }                          = require('./parsers/osaka');
const { parseHyogoImages }                    = require('./parsers/hyogo');
const { parseMiePost,      parseMiePostUrls }      = require('./parsers/mie');
const { parseShigaPost,    parseShigaPostUrls }    = require('./parsers/shiga');
const { parseNaraPost,     parseNaraPostUrls }     = require('./parsers/nara');
const { parseWakayamaPost, parseWakayamaPostUrls } = require('./parsers/wakayama');
// 四国地本
const { parseEhime }     = require('./parsers/ehime');
const { parseKagawa }    = require('./parsers/kagawa');
const { parseKochi }     = require('./parsers/kochi');
const { parseTokushima } = require('./parsers/tokushima');
// 中国地本
const { parseTottori }   = require('./parsers/tottori');
const { parseShimane }   = require('./parsers/shimane');
const { parseOkayama }   = require('./parsers/okayama');
const { parseHiroshima } = require('./parsers/hiroshima');
const { parseYamaguchi } = require('./parsers/yamaguchi');
// 九州・沖縄地本
const { parseFukuoka }   = require('./parsers/fukuoka');
const { parseSaga }      = require('./parsers/saga');
const { parseNagasaki }  = require('./parsers/nagasaki');
const { parseKumamoto }  = require('./parsers/kumamoto');
const { parseOita }      = require('./parsers/oita');
const { parseMiyazaki }  = require('./parsers/miyazaki');
const { parseKagoshima } = require('./parsers/kagoshima');
const { parseOkinawa }   = require('./parsers/okinawa');
const { toHalfWidth, reiwaToAD, padTwo, isPast, guessCategory, guessTag, calcWeekday, titleHash } = require('./parsers/utils');

// ── 設定 ─────────────────────────────────────────────────────
const OUTPUT_PATH = path.join(__dirname, '../public/data/events.json');

const URLS = {
  // 北海道地本（札幌は複数サブページ）
  sapporo_station:  'https://www.mod.go.jp/pco/sapporo/event_station.html',
  sapporo_naval:    'https://www.mod.go.jp/pco/sapporo/event_naval.html',
  sapporo_concert:  'https://www.mod.go.jp/pco/sapporo/event_concert.html',
  sapporo_other:    'https://www.mod.go.jp/pco/sapporo/event_other.html',
  asahikawa:        'https://www.mod.go.jp/pco/asahikawa/event.html',
  obihiro:          'https://www.mod.go.jp/pco/obihiro/topics_event.html',
  hakodate:         'https://www.mod.go.jp/pco/hakodate/publicity/',
  // 東北地本
  miyagi:           'https://www.mod.go.jp/pco/miyagi/',
  aomori:           'https://www.mod.go.jp/pco/aomori/',
  iwate:            'https://www.mod.go.jp/pco/iwate/event/index.html',
  yamagata:         'https://www.mod.go.jp/pco/yamagata/event/event.html',
  fukushima:        'https://www.mod.go.jp/pco/fukushima/pr/event.html',
  akita_ical1:      'https://calendar.google.com/calendar/ical/3n2esbei0vm8qte2chsohavldc%40group.calendar.google.com/public/basic.ics',
  akita_ical2:      'https://calendar.google.com/calendar/ical/fnqjg3qoglr6iorbinvgjban7k%40group.calendar.google.com/public/basic.ics',
  // 関東地本
  kanagawa:  'https://www.mod.go.jp/pco/kanagawa/kouho/event/event.html',
  tokyo:     'https://www.mod.go.jp/pco/tokyo/event2/index.html',
  saitama:   'https://www.mod.go.jp/pco/saitama/event/',
  gunma:     'https://www.mod.go.jp/pco/gunma/event.html',
  tochigi:   'https://www.mod.go.jp/pco/tochigi/',
  ibaraki:   'https://www.mod.go.jp/pco/ibaraki/event.html',
  chiba:     'https://www.mod.go.jp/pco/chiba/event.html',
  // 中部地本
  niigata:   'https://www.mod.go.jp/pco/niigata/HP/event-schedule.html',
  toyama:    'https://www.mod.go.jp/pco/toyama/content/04-event/04-event.html',
  ishikawa:  'https://www.mod.go.jp/pco/ishikawa/event29/index.html',
  fukui:     'https://www.mod.go.jp/pco/fukui/contents/9-event/9-event.html',
  yamanashi: 'https://www.mod.go.jp/pco/yamanashi/event.html',
  nagano:    'https://calendar.google.com/calendar/ical/naganopcohp%40gmail.com/public/basic.ics',
  gifu:      'https://www.mod.go.jp/pco/gifu/event/event.html',
  shizuoka:  'https://www.mod.go.jp/pco/sizuoka/event/index.html',
  aichi:     'https://www.mod.go.jp/pco/aichi/calendar.html',
  // 近畿地本
  mie:       'https://www.mod.go.jp/pco/mie/events-page/',
  shiga:     'https://www.mod.go.jp/pco/shiga/event-briefing/',
  kyoto:     'https://www.mod.go.jp/pco/kyoto/kouhoushitsu/index.html',
  osaka:     'https://www.mod.go.jp/pco/osaka/experience/event.html',
  hyogo:     'https://www.mod.go.jp/pco/hyogo/',
  nara:      'https://www.mod.go.jp/pco/nara/events/',
  wakayama:  'https://www.mod.go.jp/pco/wakayama/category/event/',
  // 四国地本
  ehime:     'https://www.mod.go.jp/pco/ehime/event.html',
  kagawa:    'https://www.mod.go.jp/pco/kagawa/event.html',
  kochi:     'https://www.mod.go.jp/pco/kochi/event_info.html',
  tokushima: 'https://www.mod.go.jp/pco/tokushima/event.html',
  // 中国地本
  tottori:   'https://www.mod.go.jp/pco/tottori/content/02-event/event.html',
  shimane:   'https://www.mod.go.jp/pco/shimane/event/event.html',
  okayama:   'https://www.mod.go.jp/pco/okayama/iku/kohogyoumu.html',
  hiroshima: 'https://www.mod.go.jp/pco/hiroshima/events/',
  yamaguchi: 'https://www.mod.go.jp/pco/yamaguchi/event.html',
  // 九州・沖縄地本
  fukuoka:   'https://www.mod.go.jp/pco/fukuoka/event/index.html',
  saga:      'https://www.mod.go.jp/pco/saga/event/index.html',
  nagasaki:  'https://www.mod.go.jp/pco/nagasaki/event/index.html',
  kumamoto:  'https://www.mod.go.jp/pco/kumamoto/event/index.html',
  oita:      'https://www.mod.go.jp/pco/oita/03_event.html',
  miyazaki:  'https://www.mod.go.jp/pco/miyazaki/event.html',
  kagoshima: 'https://www.mod.go.jp/pco/kagoshima/event/index.html',
  okinawa:   'https://www.mod.go.jp/pco/okinawa/event.html',
};

// ページ間の待機時間（Cloudflare/レートリミット対策）
const BETWEEN_PAGES_MS = 10_000;

// ── OCR キャッシュ ─────────────────────────────────────────────
// スキャン済み画像/PDFは再スキャンしない（API呼び出し節約）
// キー: URL文字列, 値: { cachedAt: ISO8601, result: OCR結果オブジェクト }
// ファイルは git 管理（GitHub Actions 間で引き継がれる）
const OCR_CACHE_PATH = path.join(__dirname, 'ocr-cache.json');
let ocrCache = {};
try {
  ocrCache = JSON.parse(fs.readFileSync(OCR_CACHE_PATH, 'utf8'));
  console.log(`[OCR Cache] ${Object.keys(ocrCache).length} 件のキャッシュを読み込み`);
} catch {
  // ファイルが存在しない場合は空キャッシュで開始
}

/** OCRキャッシュをファイルに書き出す（スクレイプ完了時に呼ぶ） */
function saveOcrCache() {
  try {
    fs.writeFileSync(OCR_CACHE_PATH, JSON.stringify(ocrCache, null, 2), 'utf8');
    console.log(`[OCR Cache] ${Object.keys(ocrCache).length} 件を保存`);
  } catch (err) {
    console.warn(`[OCR Cache] 保存失敗: ${err.message}`);
  }
}

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
  tochigi:   [],
  ibaraki: [
    { id: 'ib-20260601-1', pref: 'ibaraki', date: '2026-06-01', weekday: '月', title: '土浦駐屯地 見学会', place: '陸上自衛隊 土浦駐屯地', address: '', time: '10:00～12:00', category: '見学', tag: '要予約', url: '', notes: null },
  ],
  chiba: [
    { id: 'cb-20260601-1', pref: 'chiba', date: '2026-06-01', weekday: '月', title: '習志野駐屯地 見学会', place: '陸上自衛隊 習志野駐屯地', address: '', time: '10:00～12:00', category: '見学', tag: '要予約', url: '', notes: null },
  ],
  sapporo:   [],
  asahikawa: [],
  obihiro:   [],
  hakodate:  [],
  miyagi:    [],
  aomori:    [],
  iwate:     [],
  yamagata:  [],
  fukushima: [],
  akita:     [],
  niigata:   [],
  toyama:    [],
  ishikawa:  [],
  fukui:     [],
  yamanashi: [],
  nagano:    [],
  gifu:      [],
  shizuoka:  [],
  aichi:     [],
  // 近畿地本
  mie:       [],
  shiga:     [],
  kyoto:     [],
  osaka:     [],
  hyogo:     [],
  nara:      [],
  wakayama:  [],
  // 四国地本
  ehime:     [],
  kagawa:    [],
  kochi:     [],
  tokushima: [],
  // 中国地本
  tottori:   [],
  shimane:   [],
  okayama:   [],
  hiroshima: [],
  yamaguchi: [],
  // 九州・沖縄地本
  fukuoka:   [],
  saga:      [],
  nagasaki:  [],
  kumamoto:  [],
  oita:      [],
  miyazaki:  [],
  kagoshima: [],
  okinawa:   [],
};

// ── OCR（Gemini Flash による画像・PDF解析） ────────────────────

// ── Groq OCR（画像専用: 栃木・富山・兵庫・滋賀・奈良 など） ────────
// Groq llama-4-scout 無料枠: 14,400 RPD / 30 RPM（Gemini の約10倍）
// ※ Groq は PDF 非対応 → PDF は引き続き Gemini を使用

let groqQuotaExhausted = false;

/**
 * Groq Vision API を呼び出す共通関数（画像のみ対応、PDF不可）。
 * 429 時は 30 秒待機して 1 回リトライ。リトライ後も失敗で枯渇フラグをセット。
 *
 * @param {string} base64   - 画像の base64 文字列
 * @param {string} mimeType - 画像の MIME タイプ（例: "image/jpeg"）
 * @param {string} prompt   - OCR プロンプト
 * @param {string} label    - ログ用ラベル
 * @returns {Object|null}
 */
async function callGroqOcr(base64, mimeType, prompt, label = 'OCR') {
  if (!process.env.GROQ_API_KEY) return null;
  if (groqQuotaExhausted) {
    console.warn(`[${label}] Groq クォータ枯渇フラグ → スキップ`);
    return null;
  }
  const retryDelays = [30_000];
  for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
    const apiRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [{
          role:    'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
            { type: 'text',      text:      prompt },
          ],
        }],
        max_tokens:  512,
        temperature: 0,
      }),
    });
    if (!apiRes.ok) {
      if (apiRes.status === 429 && attempt < retryDelays.length) {
        console.warn(`[${label}] Groq 429 → ${retryDelays[attempt] / 1000}秒待機してリトライ`);
        await sleep(retryDelays[attempt]);
        continue;
      }
      if (apiRes.status === 429) {
        console.warn(`[${label}] Groq 429 リトライ後も失敗 → クォータ枯渇フラグをセット`);
        groqQuotaExhausted = true;
        return null;
      }
      const errText = await apiRes.text();
      console.warn(`[${label}] Groq エラー (${apiRes.status}): ${errText.slice(0, 120)}`);
      return null;
    }
    const apiJson   = await apiRes.json();
    const text      = apiJson.choices?.[0]?.message?.content ?? '';
    const jsonMatch = text.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
    if (!jsonMatch) {
      console.warn(`[${label}] Groq JSON パース失敗: ${text.slice(0, 100)}`);
      return null;
    }
    try { return JSON.parse(jsonMatch[0]); } catch { return null; }
  }
  return null;
}

// ── Gemini OCR（PDF専用: 岩手・青森・三重・和歌山 など） ───────────
// Gemini は PDF をネイティブサポート。Groq はPDF非対応のため PDF のみ引き続き使用。
// 無料枠: 1,500 RPD / 15 RPM

let geminiQuotaExhausted = false;

/**
 * Gemini OCR API を呼び出す共通関数（PDF専用。画像は callGroqOcr を使うこと）。
 * 429 時は 60 秒待機して 1 回リトライ。リトライ後も失敗で枯渇フラグをセット。
 *
 * OCR必須地本（PDF形式）:
 *   - 岩手・青森など: PDF形式のイベント情報（PDF_OCR_PROMPT）
 *   - 三重・和歌山: チラシPDF（FLYER_OCR_PROMPT）
 *
 * @param {Array} parts - Gemini API parts 配列（inline_data + text）
 * @param {string} label - ログ用ラベル
 * @returns {Object|null}
 */
async function callGeminiOcr(parts, label = 'PDF-OCR') {
  if (!process.env.GEMINI_API_KEY) return null;
  if (geminiQuotaExhausted) {
    console.warn(`[${label}] Gemini クォータ枯渇フラグ → スキップ`);
    return null;
  }
  const retryDelays = [60_000];
  for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
    const apiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { maxOutputTokens: 512, temperature: 0 },
        }),
      }
    );
    if (!apiRes.ok) {
      if (apiRes.status === 429 && attempt < retryDelays.length) {
        const wait = retryDelays[attempt];
        console.warn(`[${label}] Gemini 429 → ${wait / 1000}秒待機してリトライ`);
        await sleep(wait);
        continue;
      }
      if (apiRes.status === 429) {
        console.warn(`[${label}] Gemini 429 リトライ後も失敗 → クォータ枯渇フラグをセット`);
        geminiQuotaExhausted = true;
        return null;
      }
      const errText = await apiRes.text();
      console.warn(`[${label}] Gemini エラー (${apiRes.status}): ${errText.slice(0, 100)}`);
      return null;
    }
    const apiJson   = await apiRes.json();
    const text      = apiJson.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const jsonMatch = text.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
    if (!jsonMatch) return null;
    try { return JSON.parse(jsonMatch[0]); } catch { return null; }
  }
  return null;
}

const OCR_PROMPT = `この自衛隊イベントのポスター画像から情報を抽出してください。
以下のJSONのみを返してください（説明文不要）。該当情報がない項目はnullにしてください。
{
  "title": "ポスターに書かれた正確なイベント名",
  "time": "開催時間（例: 10:00～16:00）",
  "ageRequirement": "参加資格・対象者を簡潔に（例: 中学生以上33歳未満、日本国籍を有する方）",
  "deadline": "応募締切日（例: 4月24日（金））",
  "notes": "定員・抽選有無・注意事項など重要事項のみ50文字以内で簡潔に",
  "url": "画像内のQRコードが指すURL（QRコードがなければnull）"
}`;

/**
 * ポスター画像URLを受け取り OCR して JSON を返す（キャッシュ対応）。
 * GROQ_API_KEY が設定されていれば Groq を使用、なければ Gemini にフォールバック。
 * 結果はキャッシュに保存され、次回以降は API 呼び出しをスキップする。
 */
async function ocrImage(imageUrl) {
  if (!imageUrl) return null;
  if (!process.env.GROQ_API_KEY && !process.env.GEMINI_API_KEY) return null;

  // キャッシュヒット → 即返す
  if (ocrCache[imageUrl]) {
    console.log(`[OCR] キャッシュヒット: ${imageUrl.split('/').pop()}`);
    return ocrCache[imageUrl].result;
  }

  try {
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
    const buf      = await imgRes.arrayBuffer();
    const base64   = Buffer.from(buf).toString('base64');
    const mimeType = (imgRes.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();

    let result = null;
    if (process.env.GROQ_API_KEY) {
      result = await callGroqOcr(base64, mimeType, OCR_PROMPT, 'OCR');
    }
    if (!result && process.env.GEMINI_API_KEY) {
      result = await callGeminiOcr([
        { inline_data: { mime_type: mimeType, data: base64 } },
        { text: OCR_PROMPT },
      ], 'OCR');
    }
    if (result) ocrCache[imageUrl] = { cachedAt: new Date().toISOString(), result };
    return result;
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

// ── PDF OCR（PDF 系地本の標準パターン） ────────────────────────
// PDF 運営地本（岩手・青森など）に使用。ev.url が .pdf のイベントを対象にする。

const PDF_OCR_PROMPT = `この自衛隊イベントのPDFから情報を抽出してください。
以下のJSONのみを返してください（説明文不要）。該当情報がない項目はnullにしてください。
{
  "title": "PDFに書かれた正確なイベント名",
  "place": "開催場所・会場名（施設名・住所など）",
  "time": "開催時間（例: 10:00～16:00）",
  "ageRequirement": "参加資格・対象者を簡潔に（例: 18歳〜32歳未満、日本国籍を有する方）",
  "deadline": "応募締切日（例: 4月24日（金））",
  "notes": "定員・抽選有無・注意事項など重要事項のみ50文字以内で簡潔に"
}`;

/**
 * PDF URL を受け取り、Gemini Flash で OCR して JSON を返す。
 * GEMINI_API_KEY が未設定の場合は null を返す（OCR スキップ）。
 */
async function ocrPdf(pdfUrl) {
  if (!process.env.GEMINI_API_KEY || !pdfUrl) return null;

  try {
    const pdfRes = await fetch(pdfUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer':    'https://www.mod.go.jp/',
      },
    });
    if (!pdfRes.ok) {
      console.warn(`[PDF-OCR] PDF取得失敗 (${pdfRes.status}): ${pdfUrl}`);
      return null;
    }

    const buf    = await pdfRes.arrayBuffer();
    const base64 = Buffer.from(buf).toString('base64');

    return await callGeminiOcr([
      { inline_data: { mime_type: 'application/pdf', data: base64 } },
      { text: PDF_OCR_PROMPT },
    ], 'PDF-OCR');

  } catch (err) {
    console.warn(`[PDF-OCR] ${pdfUrl} → ${err.message}`);
    return null;
  }
}

/**
 * ev.url が .pdf で終わるイベントに対して PDF OCR を実行し
 * タイトル・場所・時間等を補完して返す。
 *
 * PDF 運営地本（岩手・青森など）の標準 OCR パターン。
 * 新たに PDF 系地本を追加する際はこの関数を main() から呼ぶこと。
 */
async function enrichWithPdfOcr(events) {
  if (!process.env.GEMINI_API_KEY) {
    console.log('[PDF-OCR] GEMINI_API_KEY 未設定のためスキップ');
    return events;
  }

  const targets = events.filter(e => e.url && e.url.endsWith('.pdf'));
  console.log(`[PDF-OCR] ${targets.length} 件の PDF を処理します`);
  const results = [];

  for (const ev of events) {
    if (!ev.url || !ev.url.endsWith('.pdf')) {
      results.push(ev);
      continue;
    }

    console.log(`[PDF-OCR] ${ev.title} (${ev.date})`);
    const ocr = await ocrPdf(ev.url);
    if (ocr) console.log(`  → title: ${ocr.title ?? '(変更なし)'}, place: ${ocr.place ?? '(変更なし)'}`);

    results.push(ocr ? {
      ...ev,
      title:          (ocr.title          && fixOcrTitle(ocr.title.trim()))  || ev.title,
      place:          (ocr.place          && ocr.place.trim())               || ev.place || '',
      time:           (ocr.time           && ocr.time.trim())                || ev.time  || '',
      ageRequirement: (ocr.ageRequirement && ocr.ageRequirement.trim())      || ev.ageRequirement || null,
      deadline:       (ocr.deadline       && ocr.deadline.trim())            || ev.deadline       || null,
      notes:          [ev.notes, ocr.notes].filter(Boolean).join('\n')       || null,
    } : ev);

    // 8秒待機（Gemini PDF-OCRのレート制限対策: 15RPM）
    await sleep(8000);
  }

  return results;
}

// ── チラシ全情報OCR（近畿WP系地本向け：PDF・画像両対応、date含む） ─────

const FLYER_OCR_PROMPT = `この自衛隊イベントのチラシ（PDF・画像）から情報を抽出してください。
以下のJSONのみを返してください（説明文不要）。該当情報がない項目はnullにしてください。
{
  "title": "チラシに書かれた正確なイベント名",
  "date": "開催日（「令和X年Y月Z日（曜日）」の形式で。例: 令和8年6月15日（日））",
  "place": "開催場所・会場名（施設名のみ、住所不要）",
  "time": "開催時間（例: 10:00～16:00）",
  "ageRequirement": "参加資格・対象者を簡潔に（例: 18歳〜32歳未満）",
  "deadline": "応募締切日（例: 6月1日（日））",
  "notes": "定員・抽選有無・注意事項など重要事項のみ50文字以内"
}`;

/**
 * PDF または画像 URL を受け取り、全情報（date 含む）を OCR して JSON を返す。
 * 近畿WP系地本のチラシ専用。キャッシュ対応。
 * - 画像: Groq 優先（フォールバック Gemini）
 * - PDF:  Gemini のみ（Groq は PDF 非対応）
 */
async function ocrFlyerFull(url) {
  if (!url) return null;
  const isPdf = /\.pdf(\?.*)?$/i.test(url);
  if (isPdf && !process.env.GEMINI_API_KEY) return null;
  if (!isPdf && !process.env.GROQ_API_KEY && !process.env.GEMINI_API_KEY) return null;

  // キャッシュヒット
  if (ocrCache[url]) {
    console.log(`[チラシOCR] キャッシュヒット: ${url.split('/').pop()}`);
    return ocrCache[url].result;
  }

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer':    'https://www.mod.go.jp/',
      },
    });
    if (!res.ok) { console.warn(`[チラシOCR] 取得失敗 ${res.status}: ${url}`); return null; }
    const buf    = await res.arrayBuffer();
    const base64 = Buffer.from(buf).toString('base64');
    const mime   = isPdf ? 'application/pdf' : (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();

    let result = null;
    if (isPdf) {
      // PDF → Gemini のみ（Groq は PDF 非対応）
      result = await callGeminiOcr([
        { inline_data: { mime_type: mime, data: base64 } },
        { text: FLYER_OCR_PROMPT },
      ], 'チラシOCR-PDF');
    } else {
      // 画像 → Groq 優先、フォールバック Gemini
      if (process.env.GROQ_API_KEY) {
        result = await callGroqOcr(base64, mime, FLYER_OCR_PROMPT, 'チラシOCR');
      }
      if (!result && process.env.GEMINI_API_KEY) {
        result = await callGeminiOcr([
          { inline_data: { mime_type: mime, data: base64 } },
          { text: FLYER_OCR_PROMPT },
        ], 'チラシOCR');
      }
    }
    if (result) ocrCache[url] = { cachedAt: new Date().toISOString(), result };
    return result;
  } catch (err) {
    console.warn(`[チラシOCR] ${url} → ${err.message}`);
    return null;
  }
}

/**
 * _flyerUrl を持つスタブイベントに対してチラシOCRを実行し、
 * date・title・place 等を補完して返す。date が取れないまたは過去の場合は除外。
 * 近畿WP系地本（三重・滋賀・奈良・和歌山）向け。
 */
async function enrichFromFlyer(events, prefLabel) {
  const results = [];
  for (const ev of events) {
    if (!ev._flyerUrl) {
      results.push(ev);
      continue;
    }
    if (!process.env.GROQ_API_KEY && !process.env.GEMINI_API_KEY) {
      // APIキーなし → スタブは捨てる
      continue;
    }
    console.log(`[${prefLabel} チラシOCR] ${ev.title}`);
    const ocr = await ocrFlyerFull(ev._flyerUrl);
    // 2秒待機（Groq画像OCR: 30RPM対応。PDFはGeminiのため8秒は enrichWithPdfOcr 側で行う）
    await sleep(2000);
    if (!ocr || !ocr.date) {
      console.log(`  → 日付取得失敗: スキップ`);
      continue;
    }

    // OCR日付を解析
    const rawDate = toHalfWidth((ocr.date || '').replace(/\s+/g, ' ').trim());
    const reiwaM  = rawDate.match(/令和(\d+)年(\d+)月(\d+)日[（(]([月火水木金土日祝]+)[）)]/);
    const gregM   = rawDate.match(/(\d{4})年(\d+)月(\d+)日[（(]([月火水木金土日祝]+)[）)]/);
    const monthM  = rawDate.match(/(\d+)月(\d+)日[（(]([月火水木金土日祝]+)[）)]/);

    let dateStr = '', weekday = '';
    if (reiwaM) {
      const y = reiwaToAD(parseInt(reiwaM[1], 10));
      dateStr = `${y}-${padTwo(parseInt(reiwaM[2], 10))}-${padTwo(parseInt(reiwaM[3], 10))}`;
      weekday = reiwaM[4];
    } else if (gregM) {
      dateStr = `${gregM[1]}-${padTwo(parseInt(gregM[2], 10))}-${padTwo(parseInt(gregM[3], 10))}`;
      weekday = gregM[4];
    } else if (monthM) {
      const now = new Date();
      dateStr = `${now.getFullYear()}-${padTwo(parseInt(monthM[1], 10))}-${padTwo(parseInt(monthM[2], 10))}`;
      weekday = monthM[3];
    }

    if (!dateStr || isPast(dateStr)) {
      console.log(`  → 過去またはスキップ: ${ocr.date}`);
      continue;
    }

    const { _flyerUrl, ...baseEv } = ev;
    const title   = (ocr.title && fixOcrTitle(ocr.title.trim())) || ev.title;
    const idBase  = ev.id.split('-')[0];  // 例: 'na', 'mi', 'sh', 'wk'
    results.push({
      ...baseEv,
      id:             `${idBase}-${dateStr.replace(/-/g, '')}-${titleHash(dateStr, title)}`,
      date:           dateStr,
      weekday,
      title,
      place:          (ocr.place          && ocr.place.trim())          || '',
      time:           (ocr.time           && ocr.time.trim())           || '',
      ageRequirement: (ocr.ageRequirement && ocr.ageRequirement.trim()) || null,
      deadline:       (ocr.deadline       && ocr.deadline.trim())       || null,
      notes:          ocr.notes || null,
      category:       guessCategory(toHalfWidth(title)),
      tag:            guessTag(title),
    });
    console.log(`  → ${dateStr} ${title.substring(0, 30)}`);
  }
  return results;
}

// 栃木専用: 全イベント情報（日付・場所含む）を画像から抽出するプロンプト
const OCR_PROMPT_FULL = `この自衛隊イベントのポスター画像から情報を抽出してください。
以下のJSONのみを返してください（説明文不要）。該当情報がない項目はnullにしてください。
{
  "title": "ポスターに書かれた正確なイベント名",
  "date": "開催日（「令和X年Y月Z日（曜日）」の形式で。例: 令和8年5月19日（火））",
  "place": "開催場所・見学先の名称",
  "time": "開催時間（例: 10:00～16:00）",
  "ageRequirement": "参加資格・対象者を簡潔に（例: 中学生以上33歳未満、日本国籍を有する方）",
  "deadline": "応募締切日（例: 4月24日（金））",
  "notes": "定員・抽選有無・注意事項など重要事項のみ50文字以内で簡潔に"
}`;

/**
 * 画像 1 枚から全イベント情報（日付・場所含む）を OCR する（栃木・富山・兵庫用）。
 * キャッシュ対応。Groq 優先、フォールバックで Gemini。
 */
async function ocrImageFull(imageUrl) {
  if (!imageUrl) return null;
  if (!process.env.GROQ_API_KEY && !process.env.GEMINI_API_KEY) return null;

  // キャッシュヒット
  if (ocrCache[imageUrl]) {
    console.log(`[OCR-FULL] キャッシュヒット: ${imageUrl.split('/').pop()}`);
    return ocrCache[imageUrl].result;
  }

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

    let result = null;
    if (process.env.GROQ_API_KEY) {
      result = await callGroqOcr(base64, mimeType, OCR_PROMPT_FULL, 'OCR-FULL');
    }
    if (!result && process.env.GEMINI_API_KEY) {
      result = await callGeminiOcr([
        { inline_data: { mime_type: mimeType, data: base64 } },
        { text: OCR_PROMPT_FULL },
      ], 'OCR-FULL');
    }
    if (result) ocrCache[imageUrl] = { cachedAt: new Date().toISOString(), result };
    return result;
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
  // QRコードURLは既存URLが空の場合のみ採用
  const ocrUrl = (!ev.url && ocr.url && ocr.url.startsWith('http')) ? ocr.url.trim() : ev.url;
  return {
    ...ev,
    title:          (ocr.title          && fixOcrTitle(ocr.title.trim())) || ev.title,
    time:           (ocr.time           && ocr.time.trim())           || ev.time  || '',
    ageRequirement: (ocr.ageRequirement && ocr.ageRequirement.trim()) || ev.ageRequirement || null,
    deadline:       (ocr.deadline       && ocr.deadline.trim())       || ev.deadline       || null,
    notes: [ev.notes, ocr.notes].filter(Boolean).join('\n') || null,
    url:            ocrUrl,
  };
}

/**
 * OCR 結果を個別イベントオブジェクトの配列に展開する。
 *
 * Groq llama-4-scout は1枚の画像に複数イベントが含まれる場合、
 * フィールド値を配列で返すことがある（例: title/date/place が同じ長さの配列）。
 * また、モデルによってはオブジェクト配列 [{...}, {...}] を返す場合もある。
 *
 * この関数はどちらの形式も受け取り、常に個別オブジェクトの配列として返す。
 * スカラー値の場合は要素1つの配列として返す。
 *
 * @param {Object|Object[]|null} ocr - callGroqOcr / callGeminiOcr の戻り値
 * @returns {Object[]} 正規化された個別イベントオブジェクトの配列
 */
function expandOcrResult(ocr) {
  if (!ocr) return [];

  // モデルがオブジェクト配列 [{...}, {...}] で返した場合
  if (Array.isArray(ocr)) {
    return ocr.filter(item => item && typeof item === 'object');
  }

  const isArr = (v) => Array.isArray(v);

  // 全フィールドがスカラー → そのまま1件として返す
  if (!isArr(ocr.title) && !isArr(ocr.date) && !isArr(ocr.place)) {
    return [ocr];
  }

  // フィールド値が配列の場合: 最大長を決定してインデックスでzipする
  const len = Math.max(
    isArr(ocr.title) ? ocr.title.length : 1,
    isArr(ocr.date)  ? ocr.date.length  : 1,
    isArr(ocr.place) ? ocr.place.length : 1,
  );

  const results = [];
  for (let i = 0; i < len; i++) {
    results.push({
      title:          isArr(ocr.title)          ? (ocr.title[i]          ?? null) : ocr.title,
      date:           isArr(ocr.date)            ? (ocr.date[i]           ?? null) : ocr.date,
      place:          isArr(ocr.place)           ? (ocr.place[i]          ?? null) : ocr.place,
      time:           isArr(ocr.time)            ? (ocr.time[i]           ?? null) : ocr.time,
      ageRequirement: isArr(ocr.ageRequirement)  ? (ocr.ageRequirement[i] ?? null) : ocr.ageRequirement,
      deadline:       isArr(ocr.deadline)        ? (ocr.deadline[i]       ?? null) : ocr.deadline,
      notes:          isArr(ocr.notes)           ? (ocr.notes[i]          ?? null) : ocr.notes,
      url:            isArr(ocr.url)             ? (ocr.url[i]            ?? null) : ocr.url,
    });
  }
  return results;
}

/** URL が画像ファイル（jpg/jpeg/png/gif/webp）を指しているか判定 */
function isImageUrl(url) {
  if (!url) return false;
  return /\.(jpe?g|png|gif|webp)\s*$/i.test(url.split('?')[0].trimEnd());
}

/**
 * イベント配列に対して順番に OCR を実行し、結果をマージして返す。
 * - ev.imageUrl が設定されている場合: imageUrl を使用（url はそのまま保持）
 * - ev.imageUrl が未設定で ev.url が画像ファイルの場合: url を画像として使用し、url は null に
 * 失敗したイベントは元データのまま保持する。
 */
async function enrichWithOcr(events) {
  if (!process.env.GROQ_API_KEY && !process.env.GEMINI_API_KEY) {
    console.log('[OCR] GROQ_API_KEY / GEMINI_API_KEY ともに未設定のためスキップ');
    return events;
  }

  const targets = events.filter(e => e.imageUrl || isImageUrl(e.url));
  if (targets.length === 0) return events;
  console.log(`[OCR] ${targets.length} 件の画像を処理します`);
  const results = [];

  for (const ev of events) {
    // imageUrl 優先。なければ url が画像ファイルの場合に使用
    const imgUrl = ev.imageUrl || (isImageUrl(ev.url) ? ev.url : null);
    if (!imgUrl) {
      results.push(ev);
      continue;
    }

    console.log(`[OCR] ${ev.title} (${ev.date})`);
    const ocr = await ocrImage(imgUrl);
    if (ocr) console.log(`  → deadline: ${ocr.deadline ?? 'なし'}, age: ${ocr.ageRequirement ?? 'なし'}`);

    // url が画像ファイル直リンクだった場合は null にして公式ページとして開かれないようにする
    const cleanUrl = ev.imageUrl ? ev.url : null;
    results.push({ ...mergeOcr(ev, ocr), url: cleanUrl });

    // 2秒待機（Groq: 30RPM、キャッシュヒット時はほぼ即時）
    await sleep(2000);
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

/** Cloudflare チャレンジページかどうかを判定 */
function isChallengeTitle(title) {
  return title.includes('しばらくお待ちください')
    || title.includes('Just a moment')
    || title.includes('Attention Required');
}

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

    const html  = await page.content();
    const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '';
    console.log(`[神奈川] page title: ${title.trim().substring(0, 70)}`);

    if (isChallengeTitle(title)) throw new Error(`Cloudflare challenge: ${title.trim()}`);

    const $ = cheerio.load(html, { decodeEntities: false });
    const events = parseKanagawa($);
    console.log(`[神奈川] ${events.length} 件取得 (Playwright)`);
    return events;
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
 */
async function fetchTokyo(context) {
  return fetchHtmlPref(context, '東京', URLS.tokyo, parseTokyo);
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
    // domcontentloaded: HTML 取得後すぐに waitForFunction でチャレンジ解決を待つ
    // → 解決できなければ 30 秒でタイムアウトしてフォールバックに移行（素早い失敗）
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // Cloudflare チャレンジページ（英語・日本語）のタイトルが消えるまで最大 90 秒待つ
    // 神奈川の cf_clearance クッキーが同一コンテキストで引き継がれるため
    // 後続ページのチャレンジも 90 秒以内に突破できる
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
    } catch { /* チャレンジなし or タイムアウト → そのまま続行 */ }

    await page.waitForTimeout(2000);

    const html  = await page.content();
    const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '(no title)';
    console.log(`[${prefLabel}] page title: ${title.trim().substring(0, 70)}`);

    // チャレンジページのままなら前回データ保持のためエラーを投げる
    if (isChallengeTitle(title)) throw new Error(`Cloudflare challenge: ${title.trim()}`);

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

const fetchGunma     = (ctx) => fetchHtmlPref(ctx, '群馬', URLS.gunma,     parseGunma);
const fetchIbaraki   = (ctx) => fetchHtmlPref(ctx, '茨城', URLS.ibaraki,   parseIbaraki);
const fetchChiba     = (ctx) => fetchHtmlPref(ctx, '千葉', URLS.chiba,     parseChiba);
// 近畿地本（HTML スクレイピング）
const fetchKyoto     = (ctx) => fetchHtmlPref(ctx, '京都', URLS.kyoto,     parseKyoto);
const fetchOsaka     = (ctx) => fetchHtmlPref(ctx, '大阪', URLS.osaka,     parseOsaka);
// 東北地本（HTML スクレイピング）
const fetchMiyagi    = (ctx) => fetchHtmlPref(ctx, '宮城', URLS.miyagi,    parseMiyagi);
const fetchAomori    = (ctx) => fetchHtmlPref(ctx, '青森', URLS.aomori,    parseAomori);
const fetchIwate     = (ctx) => fetchHtmlPref(ctx, '岩手', URLS.iwate,     parseIwate);
const fetchYamagata  = (ctx) => fetchHtmlPref(ctx, '山形', URLS.yamagata,  parseYamagata);
const fetchFukushima = (ctx) => fetchHtmlPref(ctx, '福島', URLS.fukushima, parseFukushima);
// 中部地本（HTML スクレイピング）
const fetchNiigata   = (ctx) => fetchHtmlPref(ctx, '新潟', URLS.niigata,   parseNiigata);
const fetchIshikawa  = (ctx) => fetchHtmlPref(ctx, '石川', URLS.ishikawa,  parseIshikawa);
const fetchFukui     = (ctx) => fetchHtmlPref(ctx, '福井', URLS.fukui,     parseFukui);
const fetchYamanashi = (ctx) => fetchHtmlPref(ctx, '山梨', URLS.yamanashi, parseYamanashi);
const fetchGifu      = (ctx) => fetchHtmlPref(ctx, '岐阜', URLS.gifu,      parseGifu);
async function fetchAichi(ctx) {
  // カレンダーページから基本情報を取得
  const events = await fetchHtmlPref(ctx, '愛知', URLS.aichi, parseAichi);

  // URL を持つイベントの詳細ページから place/time を補完
  let enriched = 0;
  for (const ev of events) {
    if (!ev.url || ev.place) continue;
    try {
      const page = await ctx.newPage();
      try {
        await page.goto(ev.url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
        await page.waitForTimeout(1500);
        const html = await page.content();
        const $ = cheerio.load(html, { decodeEntities: false });
        const detail = parseAichiDetail($);
        if (detail.place) { ev.place = detail.place; enriched++; }
        if (detail.time)  { ev.time  = detail.time; }
      } finally {
        await page.close();
      }
    } catch {
      // 詳細取得失敗は無視（place は空文字のまま）
    }
  }
  if (enriched > 0) console.log(`[愛知] 詳細ページから place 補完: ${enriched}件`);
  return events;
}
const fetchShizuoka  = (ctx) => fetchHtmlPref(ctx, '静岡', URLS.shizuoka,  parseShizuoka);

/**
 * 札幌地本: 4 つのサブページを順番に取得し、イベントを統合して返す。
 */
async function fetchSapporo(context) {
  console.log('[札幌] 4 サブページを取得中...');
  const subPages = [
    { url: URLS.sapporo_station, cat: '一般公開', id: 'st' },
    { url: URLS.sapporo_naval,   cat: '一般公開', id: 'nv' },
    { url: URLS.sapporo_concert, cat: '演奏会',   id: 'co' },
    { url: URLS.sapporo_other,   cat: 'イベント', id: 'ot' },
  ];
  const state  = { counter: 0 };
  const allEvs = [];

  for (const sp of subPages) {
    const page = await context.newPage();
    try {
      await page.goto(sp.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      try {
        await page.waitForFunction(
          () => { const t = document.title; return t.length > 0 && !t.includes('Just a moment') && !t.includes('しばらくお待ちください'); },
          { timeout: 60_000 }
        );
      } catch { /* ok */ }
      await page.waitForTimeout(2000);
      const html  = await page.content();
      const $     = cheerio.load(html, { decodeEntities: false });
      const evs   = parseSapporoPage($, sp.cat, sp.id, state, sp.url);
      console.log(`[札幌] ${sp.url.split('/').pop()} → ${evs.length} 件`);
      allEvs.push(...evs);
    } catch (err) {
      console.warn(`[札幌] ${sp.url} 失敗: ${err.message.substring(0, 60)}`);
    } finally {
      await page.close();
    }
    await sleep(3000);
  }

  const seen = new Set();
  const result = allEvs
    .filter(e => { const k = `${e.date}-${e.title}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.date.localeCompare(b.date));
  console.log(`[札幌] 合計 ${result.length} 件`);
  return result;
}

/**
 * 秋田地本: Google カレンダー iCal 2 本を fetch して統合する。
 */
async function fetchAkita() {
  console.log('[秋田] Google Calendar iCal 取得...');
  const fetchIcal = async (url) => {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/calendar, */*' },
    });
    if (!res.ok) { console.warn(`[秋田] iCal ${res.status}: ${url}`); return ''; }
    return res.text();
  };
  const [ics1, ics2] = await Promise.all([
    fetchIcal(URLS.akita_ical1),
    fetchIcal(URLS.akita_ical2),
  ]);
  const events = parseAkita(ics1, ics2);
  console.log(`[秋田] ${events.length} 件取得 (iCal)`);
  return events;
}

/**
 * 長野地本: Google カレンダー iCal フィードを直接 fetch して解析する。
 * Playwright 不要（Google カレンダー URL は Cloudflare 対象外）。
 */
async function fetchNagano() {
  console.log(`[長野] iCal フィード取得: ${URLS.nagano}`);
  const res = await fetch(URLS.nagano, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept':     'text/calendar, */*',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const icsText = await res.text();
  const events  = parseNagano(icsText);
  console.log(`[長野] ${events.length} 件取得 (iCal)`);
  return events;
}

/**
 * WordPress 系地本: 一覧ページから投稿 URL を取得し、各投稿ページを順次フェッチして
 * parserFn でイベントを抽出する共通関数。
 *
 * @param {BrowserContext} ctx
 * @param {string}         pref     - ログ用ラベル
 * @param {string}         listUrl  - 一覧ページ URL
 * @param {Function}       urlsFn   - 一覧ページ HTML からポスト URL 配列を返す関数
 * @param {Function}       postFn   - 個別投稿 HTML から events 配列を返す関数(($, url, counter) => [])
 * @param {number}         maxPosts - 最大取得投稿数
 */
/**
 * 一覧ページの $ から投稿 URL と紐づくサムネイル画像を抽出してスタブを生成する。
 *
 * 近畿 WP 系地本（三重・滋賀・奈良・和歌山）では個別投稿ページが Cloudflare に
 * ブロックされる（一覧ページは取得可能）。一覧ページに掲載されたサムネイル画像を
 * _flyerUrl としてスタブ化し、enrichFromFlyer で OCR する。
 *
 * @param {import('cheerio').CheerioAPI} $ - 一覧ページの cheerio インスタンス
 * @param {string[]} postUrls - 投稿 URL 配列
 * @param {string} pref - 都道府県キー（例: 'nara'）
 * @param {string} prefLabel - ログ用ラベル（例: '奈良'）
 * @returns {Array<Object>} _flyerUrl 付きスタブ配列
 */
/**
 * 一覧ページの $ から投稿 URL と紐づくサムネイル画像を抽出してスタブを生成する。
 *
 * @param {import('cheerio').CheerioAPI} $ - 一覧ページの cheerio インスタンス
 * @param {string[]} postUrls - 投稿 URL 配列
 * @param {string} prefKey  - 都道府県英語キー（例: 'nara'）— pref フィールドに使用
 * @param {string} idPrefix - ID プレフィックス（例: 'na'）
 * @param {string} prefLabel - ログ用ラベル（例: '奈良'）
 * @returns {Array<Object>} _flyerUrl 付きスタブ配列
 */
function extractListPageStubs($, postUrls, prefKey, idPrefix, prefLabel) {
  const postUrlSet = new Set(postUrls);
  const stubs      = [];
  let counter      = 0;

  // 各投稿リンクを基点に、最も近い article/li/div コンテナを探して画像を取得する
  $('a[href]').each((_, link) => {
    const url = ($(link).attr('href') || '').trim().replace(/\/$/, '') + '/';
    const normalUrl = ($(link).attr('href') || '').trim();
    const matchUrl = postUrlSet.has(url) ? url : (postUrlSet.has(normalUrl) ? normalUrl : null);
    if (!matchUrl || stubs.some(s => s.url === matchUrl)) return;

    // コンテナ: article → li → .post/.entry → 親3段目まで試みる
    const $container = $(link).closest('article, li, .post, .entry, .hentry, [class*="post-"], [class*="entry-"]');
    const $scope     = $container.length ? $container : $(link).parent().parent().parent();

    // タイトル
    const rawTitle = ($scope.find('.entry-title, h2, h3, h4, h1').first().text()
                   || $(link).text() || '').trim().replace(/[「」]|掲載しました。?/g, '').trim();

    // サムネイル画像（wp-content/uploads に限定）
    // 除外: ロゴ・アイコン・矢印・nophoto など汎用画像
    //       ファイル名が MD5 ハッシュのみ（WordPress プレースホルダー）も除外
    const isPlaceholder = (s) =>
      /logo|icon|arrow|nophoto|noimage|dummy|placeholder/i.test(s)
      || /\/[0-9a-f]{32}\.(jpe?g|png)$/i.test(s);   // WP MD5ハッシュプレースホルダー

    let flyerUrl = '';
    $scope.find('img').each((_, img) => {
      for (const attr of ['src', 'data-src', 'data-lazy-src']) {
        const s = ($(img).attr(attr) || '').trim();
        if (s && /wp-content|\/uploads\//i.test(s)
              && /\.(jpe?g|png)/i.test(s)
              && !isPlaceholder(s)) {
          flyerUrl = s.startsWith('http') ? s : `https://www.mod.go.jp${s.startsWith('/') ? '' : '/'}${s}`;
          return false;
        }
      }
      // srcset の最初の画像も試みる
      const srcset = ($(img).attr('srcset') || '').split(',')[0].trim().split(' ')[0];
      if (srcset && /wp-content|\/uploads\//i.test(srcset) && /\.(jpe?g|png)/i.test(srcset)
          && !isPlaceholder(srcset)) {
        flyerUrl = srcset.startsWith('http') ? srcset : `https://www.mod.go.jp${srcset}`;
        return false;
      }
    });

    // 画像がない場合はPDFリンクも試みる（三重・和歌山など画像なしWP地本向け）
    if (!flyerUrl) {
      $scope.find('a[href]').each((_, a) => {
        const h = ($(a).attr('href') || '').trim();
        // 相対URL（/pco/...）も絶対URL（https://www.mod.go.jp/...）も受け入れる
        if (/\.pdf(\?.*)?$/i.test(h) && (h.startsWith('/') || /mod\.go\.jp/i.test(h))) {
          flyerUrl = h.startsWith('http') ? h : `https://www.mod.go.jp${h.startsWith('/') ? '' : '/'}${h}`;
          return false;
        }
      });
    }

    if (flyerUrl) {
      // 画像/PDFあり → OCR スタブ（日付は後でOCRで補完）
      stubs.push({
        id:             `${idPrefix}-flyer-${++counter}`,
        pref:           prefKey,
        date:           '', weekday: '',
        title:          (rawTitle || matchUrl.split('/').filter(Boolean).pop() || 'event').substring(0, 60),
        place:          '', address: '', time: '',
        category:       '', tag:      '',
        url:            matchUrl,
        notes:          null, ageRequirement: null, deadline: null, imageUrl: '',
        _flyerUrl:      flyerUrl,
      });
      return;
    }

    // 画像・PDFなし → コンテナのテキストから直接日付を抽出（三重・滋賀・和歌山 CF対策）
    const containerText = toHalfWidth($scope.text().replace(/\s+/g, ' ').trim());
    let textDate = '', textWeekday = '';
    const rM = containerText.match(/令和(\d+)年(\d+)月(\d+)日[（(]([月火水木金土日祝]+)[）)]/);
    const gM = containerText.match(/(\d{4})年(\d+)月(\d+)日[（(]([月火水木金土日祝]+)[）)]/);
    const mM = containerText.match(/(\d+)月(\d+)日[（(]([月火水木金土日祝]+)[）)]/);
    if (rM) {
      const y = reiwaToAD(parseInt(rM[1], 10));
      textDate    = `${y}-${padTwo(parseInt(rM[2], 10))}-${padTwo(parseInt(rM[3], 10))}`;
      textWeekday = rM[4];
    } else if (gM) {
      textDate    = `${gM[1]}-${padTwo(parseInt(gM[2], 10))}-${padTwo(parseInt(gM[3], 10))}`;
      textWeekday = gM[4];
    } else if (mM) {
      const now = new Date();
      textDate    = `${now.getFullYear()}-${padTwo(parseInt(mM[1], 10))}-${padTwo(parseInt(mM[2], 10))}`;
      textWeekday = mM[3];
    }

    if (!textDate || isPast(textDate) || !rawTitle) return;  // 日付なし・過去・タイトルなし → スキップ

    // 場所・時間も抽出
    const placeM = containerText.match(/(?:場所|会場|開催場所)[：: ]\s*(.{2,50}?)(?:\s+(?:日時|内容|[●■])|$)/);
    const place  = placeM ? placeM[1].trim().substring(0, 60) : '';
    const timeM  = containerText.match(/(\d+:\d+[～〜]\d+:\d+)/);
    const time   = timeM ? timeM[1] : '';

    stubs.push({
      id:             `${idPrefix}-${textDate.replace(/-/g, '')}-${++counter}`,
      pref:           prefKey,
      date:           textDate,
      weekday:        textWeekday,
      title:          rawTitle.substring(0, 60),
      place,
      address:        '',
      time,
      category:       guessCategory(toHalfWidth(rawTitle)),
      tag:            guessTag(rawTitle),
      url:            matchUrl,
      notes:          null, ageRequirement: null, deadline: null, imageUrl: '',
      // _flyerUrl なし → enrichFromFlyer はそのまま通過
    });
  });

  const imgStubs  = stubs.filter(s => s._flyerUrl);
  const textStubs = stubs.filter(s => !s._flyerUrl);
  if (imgStubs.length > 0)  console.log(`[${prefLabel}] 一覧ページ画像スタブ: ${imgStubs.length} 件 (${imgStubs.map(s => s._flyerUrl.split('/').pop()).join(', ')})`);
  if (textStubs.length > 0) console.log(`[${prefLabel}] 一覧ページテキストスタブ: ${textStubs.length} 件 (${textStubs.map(s => `${s.date} ${s.title.substring(0,20)}`).join(', ')})`);
  if (imgStubs.length === 0 && textStubs.length === 0) console.log(`[${prefLabel}] 一覧ページ画像スタブ: 0 件 ()`);
  return stubs;
}

/**
 * @param {string} pref      - ログ用ラベル（例: '奈良'）
 * @param {string} prefKey   - 都道府県英語キー（例: 'nara'）
 * @param {string} idPrefix  - ID プレフィックス（例: 'na'）
 */
async function fetchWpPosts(ctx, pref, prefKey, idPrefix, listUrl, urlsFn, postFn, maxPosts = 5) {
  console.log(`[${pref}] 一覧ページ取得: ${listUrl}`);
  let postUrls = [];
  let listStubs = [];
  let listHtml = '';

  // ── 一覧ページ（CF クリアランス用: ページを開いたまま保持する）──
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
    listHtml   = await listPage.content();
    const $    = cheerio.load(listHtml, { decodeEntities: false });
    postUrls   = [...new Set(urlsFn($))].slice(0, maxPosts);
    console.log(`[${pref}] 投稿 URL ${postUrls.length} 件取得`);

    // 一覧ページからサムネイルスタブも取得（個別投稿が CF ブロックされる場合のフォールバック）
    if (postUrls.length > 0) {
      listStubs = extractListPageStubs($, postUrls, prefKey, idPrefix, pref);
    }
  } catch (err) {
    console.warn(`[${pref}] 一覧ページ失敗: ${err.message.substring(0, 60)}`);
    await listPage.close();
    return [];
  }

  if (postUrls.length === 0) {
    await listPage.close();
    return [];
  }

  // ── 各投稿ページ ──
  // 一覧スタブがある URL のセット（in-page fetch 成功時にスタブより HTML を優先するため参照する）
  const listStubUrlSet = new Set(listStubs.map(s => s.url));

  const events = [];
  const succeededUrls = new Set();
  let counter  = 0;

  // すべての投稿 URL で in-page fetch を試みる
  // 　- スタブ対象 URL も含む（HTML パースが成功すれば OCR より精度が高い）
  // 　- スタブ対象でない URL は fetch 失敗時に ctx.newPage() フォールバックも使う
  for (const postUrl of postUrls) {
    const slug = postUrl.replace(/\/$/, '').split('/').pop();
    const hasStub = listStubUrlSet.has(postUrl);
    let html = null;

    // ① 一覧ページの CF クリアランス済みセッションで fetch（高速・CF 再チャレンジなし）
    try {
      html = await listPage.evaluate(async (url) => {
        try {
          const r = await fetch(url, { credentials: 'include' });
          if (!r.ok) return null;
          return await r.text();
        } catch { return null; }
      }, postUrl);
    } catch { /* listPage が閉じている場合など */ }

    // ② fetch 失敗かつスタブなし URL のみ: 新規ページで goto（スタブ URL は OCR に任せる）
    if (!html && !hasStub) {
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
        html = await postPage.content();
      } catch (err) {
        console.warn(`[${pref}] 投稿取得失敗: ${err.message.substring(0, 60)}`);
      } finally {
        await postPage.close();
      }
    }

    if (!html) { await sleep(500); continue; }

    try {
      const $ = cheerio.load(html, { decodeEntities: false });

      // CF チャレンジ判定: body が短い or CF 固有テキストを含む
      const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
      const isCfBlocked = bodyText.length < 100
        || /Just a moment|Enable JavaScript and cookies|しばらくお待ちください/i.test(bodyText);
      if (isCfBlocked) {
        // CF ブロック: スタブなし URL のみログ（スタブ URL は後で OCR が処理する）
        if (!hasStub) console.log(`[${pref}] ${slug} → CF ブロック (bodyLen=${bodyText.length})`);
      } else {
        const evs = postFn($, postUrl, ++counter);
        if (evs.length) {
          console.log(`[${pref}] ${slug} → ${evs[0].date} ${evs[0].title.substring(0,30)}`);
          events.push(...evs);
          succeededUrls.add(postUrl);  // スタブ URL は OCR をスキップ
        } else {
          if (!hasStub) console.log(`[${pref}] ${slug} → コンテンツ取得済み・0件 (bodyLen=${bodyText.length})`);
        }
      }
    } catch (err) {
      console.warn(`[${pref}] 投稿パース失敗: ${err.message.substring(0, 60)}`);
    }
    await sleep(500);
  }

  await listPage.close();

  // 一覧スタブをそのまま追加（in-page fetch で取得できなかった分をカバー → OCR へ）
  if (listStubs.length > 0) {
    const nonSucceeded = listStubs.filter(s => !succeededUrls.has(s.url));
    if (nonSucceeded.length > 0) {
      console.log(`[${pref}] 一覧スタブ ${nonSucceeded.length} 件を追加 (OCR待ち)`);
      events.push(...nonSucceeded);
    }
  }

  // フォールバック: 個別投稿・スタブからも取得できなかった場合、
  // 一覧ページ本文を直接 postFn でパース試みる（三重・滋賀など埋め込み型 WP 地本向け）
  if (events.length === 0 && listHtml) {
    try {
      const $list = cheerio.load(listHtml, { decodeEntities: false });
      const listEvs = postFn($list, listUrl, 0);
      if (listEvs.length > 0) {
        console.log(`[${pref}] 一覧ページ直接パース: ${listEvs.length} 件`);
        events.push(...listEvs);
      }
    } catch { /* 失敗しても無視 */ }
  }

  console.log(`[${pref}] ${events.length} 件取得`);
  return events;
}

//                                   label    prefKey      idPrefix  listUrl         urlsFn                postFn           maxPosts
const fetchMie      = (ctx) => fetchWpPosts(ctx, '三重',   'mie',      'mi',  URLS.mie,      parseMiePostUrls,      parseMiePost,      5);
const fetchShiga    = (ctx) => fetchWpPosts(ctx, '滋賀',   'shiga',    'sh',  URLS.shiga,    parseShigaPostUrls,    parseShigaPost,    5);
const fetchNara     = (ctx) => fetchWpPosts(ctx, '奈良',   'nara',     'na',  URLS.nara,     parseNaraPostUrls,     parseNaraPost,     5);
const fetchWakayama = (ctx) => fetchWpPosts(ctx, '和歌山', 'wakayama', 'wk',  URLS.wakayama, parseWakayamaPostUrls, parseWakayamaPost, 5);

/**
 * 兵庫地本: TOP ページからイベントバナー画像を取得し OCR でイベントを抽出する。
 * GEMINI_API_KEY 未設定の場合は空配列を返す。
 */
async function fetchHyogo(context) {
  console.log(`[兵庫] アクセス: ${URLS.hyogo}`);

  const page = await context.newPage();
  let imageUrls = [];
  try {
    await page.goto(URLS.hyogo, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    try {
      await page.waitForFunction(
        () => { const t = document.title; return t.length > 0 && !t.includes('Just a moment') && !t.includes('しばらくお待ちください'); },
        { timeout: 90_000 }
      );
    } catch {}
    await page.waitForTimeout(2000);
    const html = await page.content();
    const $    = cheerio.load(html, { decodeEntities: false });
    imageUrls  = parseHyogoImages($);
    console.log(`[兵庫] ${imageUrls.length} 件の画像を検出`);
  } catch (err) {
    console.warn(`[兵庫] Playwright 失敗: ${err.message}`);
  } finally {
    await page.close();
  }

  if (!process.env.GROQ_API_KEY && !process.env.GEMINI_API_KEY) {
    console.log('[兵庫] GROQ_API_KEY / GEMINI_API_KEY ともに未設定のため OCR スキップ');
    return [];
  }
  if (imageUrls.length === 0) return [];

  const events = [];
  let idx = 0;
  for (const imgUrl of imageUrls) {
    console.log(`[兵庫 OCR] ${imgUrl}`);
    const ocr = await ocrImageFull(imgUrl);
    // 2秒待機（Groq: 30RPM、キャッシュヒット時はほぼ即時）
    await sleep(2000);
    if (!ocr) continue;

    for (const item of expandOcrResult(ocr)) {
      const rawDate = toHalfWidth((item.date || '').replace(/\s+/g, ' ').trim());
      const dtMatch = rawDate.match(/令和(\d+)年(\d+)月(\d+)日[（(]([月火水木金土日祝・]+)[）)]/)
        || rawDate.match(/(\d{4})年(\d+)月(\d+)日[（(]([月火水木金土日祝・]+)[）)]/);

      let dateStr = '', weekday = '';
      if (dtMatch && dtMatch[0].startsWith('令和')) {
        const year = reiwaToAD(parseInt(dtMatch[1], 10));
        dateStr  = `${year}-${padTwo(parseInt(dtMatch[2], 10))}-${padTwo(parseInt(dtMatch[3], 10))}`;
        weekday  = dtMatch[4];
      } else if (dtMatch) {
        dateStr  = `${dtMatch[1]}-${padTwo(parseInt(dtMatch[2], 10))}-${padTwo(parseInt(dtMatch[3], 10))}`;
        weekday  = dtMatch[4];
      } else {
        // ファイル名から日付を推定（例: 0530aono_banner.png → 5月30日）
        const fnMatch = imgUrl.match(/(\d{2})(\d{2})[a-z]/i);
        if (fnMatch) {
          const now = new Date();
          const m = parseInt(fnMatch[1], 10), d = parseInt(fnMatch[2], 10);
          const inFut = m > now.getMonth() + 1 || (m === now.getMonth() + 1 && d >= now.getDate());
          dateStr = `${inFut ? now.getFullYear() : now.getFullYear() + 1}-${padTwo(m)}-${padTwo(d)}`;
        }
      }

      if (!dateStr || isPast(dateStr)) continue;

      const title = item.title ? fixOcrTitle(item.title.trim()) : '';
      if (!title) continue;

      events.push({
        id:             `hy-${dateStr.replace(/-/g, '')}-${titleHash(dateStr, title)}`,
        pref:           'hyogo',
        date:           dateStr,
        weekday,
        title,
        place:          (item.place          || '').trim(),
        address:        '',
        time:           (item.time           || '').trim(),
        category:       guessCategory(toHalfWidth(title)),
        tag:            guessTag(title),
        url:            URLS.hyogo,
        notes:          item.notes          || null,
        ageRequirement: item.ageRequirement || null,
        deadline:       item.deadline       || null,
        imageUrl:       '',
      });
    }
  }

  console.log(`[兵庫] ${events.length} 件取得 (OCR)`);
  return events.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 栃木地本ページを取得し、JPG ポスターを OCR してイベント一覧を返す。
 * GEMINI_API_KEY 未設定の場合は空配列を返す（OCR スキップ）。
 */
async function fetchTochigi(context) {
  console.log(`[栃木] アクセス: ${URLS.tochigi}`);

  const page = await context.newPage();
  let imageUrls = [];
  try {
    await page.goto(URLS.tochigi, { waitUntil: 'domcontentloaded', timeout: 30_000 });
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
    } catch { /* チャレンジなし or タイムアウト */ }
    await page.waitForTimeout(2000);
    const html  = await page.content();
    const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '';
    console.log(`[栃木] page title: ${title.trim().substring(0, 70)}`);
    if (isChallengeTitle(title)) throw new Error(`Cloudflare challenge: ${title.trim()}`);
    const $    = cheerio.load(html, { decodeEntities: false });
    imageUrls  = parseTochigiImages($);
    console.log(`[栃木] ${imageUrls.length} 件の画像を検出`);
  } catch (err) {
    console.warn(`[栃木] Playwright 失敗: ${err.message}`);
  } finally {
    await page.close();
  }

  if (!process.env.GROQ_API_KEY && !process.env.GEMINI_API_KEY) {
    console.log('[栃木] GROQ_API_KEY / GEMINI_API_KEY ともに未設定のため OCR スキップ');
    return [];
  }
  if (imageUrls.length === 0) return [];

  const events = [];
  let idx = 0;
  for (const imgUrl of imageUrls) {
    console.log(`[栃木 OCR] ${imgUrl}`);
    const ocr = await ocrImageFull(imgUrl);
    // 2秒待機（Groq: 30RPM、キャッシュヒット時はほぼ即時）
    await sleep(2000);
    if (!ocr) continue;

    for (const item of expandOcrResult(ocr)) {
      const rawDate = toHalfWidth((item.date || '').replace(/\s+/g, ' ').trim());
      const dtMatch = rawDate.match(/令和(\d+)年(\d+)月(\d+)日[（(]([月火水木金土日祝・]+)[）)]/);
      if (!dtMatch) { console.warn(`[栃木 OCR] 日付パース失敗: "${item.date}"`); continue; }

      const year    = reiwaToAD(parseInt(dtMatch[1], 10));
      const month   = parseInt(dtMatch[2], 10);
      const day     = parseInt(dtMatch[3], 10);
      const weekday = dtMatch[4];
      const dateStr = `${year}-${padTwo(month)}-${padTwo(day)}`;
      if (isPast(dateStr)) continue;

      const title = item.title ? fixOcrTitle(item.title.trim()) : '';
      if (!title) continue;

      events.push({
        id:             `tc-${dateStr.replace(/-/g, '')}-${titleHash(dateStr, title)}`,
        pref:           'tochigi',
        date:           dateStr,
        weekday,
        title,
        place:          (item.place          || '').trim(),
        address:        '',
        time:           (item.time           || '').trim(),
        category:       guessCategory(toHalfWidth(title)),
        tag:            guessTag(title),
        url:            '',
        notes:          item.notes          || null,
        ageRequirement: item.ageRequirement || null,
        deadline:       item.deadline       || null,
        imageUrl:       '',  // OCR 済みのため再処理不要
      });
    }
  }

  console.log(`[栃木] ${events.length} 件取得 (OCR)`);
  return events.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 富山地本ページを取得し、JPG ポスターを OCR してイベント一覧を返す。
 * GEMINI_API_KEY 未設定の場合は空配列を返す（OCR スキップ）。
 */
async function fetchToyama(context) {
  console.log(`[富山] アクセス: ${URLS.toyama}`);

  const page = await context.newPage();
  let imageUrls = [];
  try {
    await page.goto(URLS.toyama, { waitUntil: 'domcontentloaded', timeout: 30_000 });
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
    } catch { /* チャレンジなし or タイムアウト */ }
    await page.waitForTimeout(2000);
    const html  = await page.content();
    const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '';
    console.log(`[富山] page title: ${title.trim().substring(0, 70)}`);
    if (isChallengeTitle(title)) throw new Error(`Cloudflare challenge: ${title.trim()}`);
    const $   = cheerio.load(html, { decodeEntities: false });
    imageUrls = parseToyamaImages($);
    console.log(`[富山] ${imageUrls.length} 件の画像を検出`);
  } catch (err) {
    console.warn(`[富山] Playwright 失敗: ${err.message}`);
  } finally {
    await page.close();
  }

  if (!process.env.GROQ_API_KEY && !process.env.GEMINI_API_KEY) {
    console.log('[富山] GROQ_API_KEY / GEMINI_API_KEY ともに未設定のため OCR スキップ');
    return [];
  }
  if (imageUrls.length === 0) return [];

  const events = [];
  let idx = 0;
  for (const imgUrl of imageUrls) {
    console.log(`[富山 OCR] ${imgUrl}`);
    const ocr = await ocrImageFull(imgUrl);
    // 2秒待機（Groq: 30RPM、キャッシュヒット時はほぼ即時）
    await sleep(2000);
    if (!ocr) continue;

    for (const item of expandOcrResult(ocr)) {
      const rawDate = toHalfWidth((item.date || '').replace(/\s+/g, ' ').trim());
      const dtMatch = rawDate.match(/令和(\d+)年(\d+)月(\d+)日[（(]([月火水木金土日祝・]+)[）)]/);
      if (!dtMatch) { console.warn(`[富山 OCR] 日付パース失敗: "${item.date}"`); continue; }

      const year    = reiwaToAD(parseInt(dtMatch[1], 10));
      const dateStr = `${year}-${padTwo(parseInt(dtMatch[2], 10))}-${padTwo(parseInt(dtMatch[3], 10))}`;
      if (isPast(dateStr)) continue;

      const title = item.title ? fixOcrTitle(item.title.trim()) : '';
      if (!title) continue;

      events.push({
        id:             `to-${dateStr.replace(/-/g, '')}-${titleHash(dateStr, title)}`,
        pref:           'toyama',
        date:           dateStr,
        weekday:        dtMatch[4],
        title,
        place:          (item.place          || '').trim(),
        address:        '',
        time:           (item.time           || '').trim(),
        category:       guessCategory(toHalfWidth(title)),
        tag:            guessTag(title),
        url:            '',
        notes:          item.notes          || null,
        ageRequirement: item.ageRequirement || null,
        deadline:       item.deadline       || null,
        imageUrl:       '',
      });
    }
  }

  console.log(`[富山] ${events.length} 件取得 (OCR)`);
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
  let sapporoEvents   = [];
  let asahikawaEvents = [];
  let obihiroEvents   = [];
  let hakodateEvents  = [];
  let miyagiEvents    = [];
  let aomoriEvents    = [];
  let iwateEvents     = [];
  let yamagataEvents  = [];
  let fukushimaEvents = [];
  let akitaEvents     = [];
  let kanagawaEvents  = [];
  let tokyoEvents     = [];
  let saitamaEvents   = [];
  let gunmaEvents     = [];
  let tochigiEvents   = [];
  let ibarakiEvents   = [];
  let chibaEvents     = [];
  let niigataEvents   = [];
  let toyamaEvents    = [];
  let ishikawaEvents  = [];
  let fukuiEvents     = [];
  let yamanashiEvents = [];
  let naganoEvents    = [];
  let gifuEvents      = [];
  let shizuokaEvents  = [];
  let aichiEvents     = [];
  // 近畿地本
  let mieEvents       = [];
  let shigaEvents     = [];
  let kyotoEvents     = [];
  let osakaEvents     = [];
  let hyogoEvents     = [];
  let naraEvents      = [];
  let wakayamaEvents  = [];
  // 四国地本
  let ehimeEvents     = [];
  let kagawaEvents    = [];
  let kochiEvents     = [];
  let tokushimaEvents = [];
  // 中国地本
  let tottoriEvents   = [];
  let shimaneEvents   = [];
  let okayamaEvents   = [];
  let hiroshimaEvents = [];
  let yamaguchiEvents = [];
  // 九州・沖縄地本
  let fukuokaEvents   = [];
  let sagaEvents      = [];
  let nagasakiEvents  = [];
  let kumamotoEvents  = [];
  let oitaEvents      = [];
  let miyazakiEvents  = [];
  let kagoshimaEvents = [];
  let okinawaEvents   = [];
  let sapporoError   = false;
  let asahikawaError = false;
  let obihiroError   = false;
  let hakodateError  = false;
  let miyagiError    = false;
  let aomoriError    = false;
  let iwateError     = false;
  let yamagataError  = false;
  let fukushimaError = false;
  let akitaError     = false;
  let kanagawaError   = false;
  let tokyoError      = false;
  let saitamaError    = false;
  let gunmaError      = false;
  let tochigiError    = false;
  let ibarakiError    = false;
  let chibaError      = false;
  let niigataError    = false;
  let toyamaError     = false;
  let ishikawaError   = false;
  let fukuiError      = false;
  let yamanashiError  = false;
  let naganoError     = false;
  let gifuError       = false;
  let shizuokaError   = false;
  let aichiError      = false;
  // 近畿地本
  let mieError        = false;
  let shigaError      = false;
  let kyotoError      = false;
  let osakaError      = false;
  let hyogoError      = false;
  let naraError       = false;
  let wakayamaError   = false;
  // 四国地本
  let ehimeError      = false;
  let kagawaError     = false;
  let kochiError      = false;
  let tokushimaError  = false;
  // 中国地本
  let tottoriError    = false;
  let shimaneError    = false;
  let okayamaError    = false;
  let hiroshimaError  = false;
  let yamaguchiError  = false;
  // 九州・沖縄地本
  let fukuokaError    = false;
  let sagaError       = false;
  let nagasakiError   = false;
  let kumamotoError   = false;
  let oitaError       = false;
  let miyazakiError   = false;
  let kagoshimaError  = false;
  let okinawaError    = false;

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

  // 地本ごとに新規コンテキストを生成する（共有セッションだと Cloudflare に検知される）
  async function withFreshContext(fn) {
    const ctx = await createStealthContext(browser);
    try { return await fn(ctx); }
    finally { await ctx.close(); }
  }

  try {
    // ── 北海道地本 ──
    try {
      sapporoEvents = await withFreshContext(ctx => fetchSapporo(ctx));
    } catch (err) {
      console.error(`[札幌] 取得失敗: ${err.message}`);
      sapporoError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      asahikawaEvents = await withFreshContext(ctx => fetchHtmlPref(ctx, '旭川', URLS.asahikawa, parseAsahikawa));
    } catch (err) {
      console.error(`[旭川] 取得失敗: ${err.message}`);
      asahikawaError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      obihiroEvents = await withFreshContext(ctx => fetchHtmlPref(ctx, '帯広', URLS.obihiro, parseObihiro));
    } catch (err) {
      console.error(`[帯広] 取得失敗: ${err.message}`);
      obihiroError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    // 函館はInstagram移行のため空配列（パーサーが [] を返す）
    try {
      hakodateEvents = await withFreshContext(ctx => fetchHtmlPref(ctx, '函館', URLS.hakodate, parseHakodate));
    } catch (err) {
      console.error(`[函館] 取得失敗: ${err.message}`);
      hakodateError = true;
    }

    // ── 東北地本 ──
    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      miyagiEvents = await withFreshContext(ctx => fetchMiyagi(ctx));
    } catch (err) {
      console.error(`[宮城] 取得失敗: ${err.message}`);
      miyagiError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      aomoriEvents = await withFreshContext(ctx => fetchAomori(ctx));
    } catch (err) {
      console.error(`[青森] 取得失敗: ${err.message}`);
      aomoriError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      iwateEvents = await withFreshContext(ctx => fetchIwate(ctx));
    } catch (err) {
      console.error(`[岩手] 取得失敗: ${err.message}`);
      iwateError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      yamagataEvents = await withFreshContext(ctx => fetchYamagata(ctx));
    } catch (err) {
      console.error(`[山形] 取得失敗: ${err.message}`);
      yamagataError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      fukushimaEvents = await withFreshContext(ctx => fetchFukushima(ctx));
    } catch (err) {
      console.error(`[福島] 取得失敗: ${err.message}`);
      fukushimaError = true;
    }

    // 秋田は iCal fetch（Playwright 不要）
    try {
      akitaEvents = await fetchAkita();
    } catch (err) {
      console.error(`[秋田] 取得失敗: ${err.message}`);
      akitaError = true;
    }

    // ── 関東地本 ──
    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      kanagawaEvents = await withFreshContext(ctx => fetchKanagawa(ctx));
    } catch (err) {
      console.error(`[神奈川] 取得失敗: ${err.message}`);
      kanagawaError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      tokyoEvents = await withFreshContext(ctx => fetchTokyo(ctx));
    } catch (err) {
      console.error(`[東京] 取得失敗: ${err.message}`);
      tokyoError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      saitamaEvents = await withFreshContext(ctx => fetchSaitama(ctx));
    } catch (err) {
      console.error(`[埼玉] 取得失敗: ${err.message}`);
      saitamaError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      gunmaEvents = await withFreshContext(ctx => fetchGunma(ctx));
    } catch (err) {
      console.error(`[群馬] 取得失敗: ${err.message}`);
      gunmaError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      ibarakiEvents = await withFreshContext(ctx => fetchIbaraki(ctx));
    } catch (err) {
      console.error(`[茨城] 取得失敗: ${err.message}`);
      ibarakiError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      chibaEvents = await withFreshContext(ctx => fetchChiba(ctx));
    } catch (err) {
      console.error(`[千葉] 取得失敗: ${err.message}`);
      chibaError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      tochigiEvents = await withFreshContext(ctx => fetchTochigi(ctx));
    } catch (err) {
      console.error(`[栃木] 取得失敗: ${err.message}`);
      tochigiError = true;
    }

    // ── 中部地本 ──
    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      niigataEvents = await withFreshContext(ctx => fetchNiigata(ctx));
    } catch (err) {
      console.error(`[新潟] 取得失敗: ${err.message}`);
      niigataError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      toyamaEvents = await withFreshContext(ctx => fetchToyama(ctx));
    } catch (err) {
      console.error(`[富山] 取得失敗: ${err.message}`);
      toyamaError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      ishikawaEvents = await withFreshContext(ctx => fetchIshikawa(ctx));
    } catch (err) {
      console.error(`[石川] 取得失敗: ${err.message}`);
      ishikawaError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      fukuiEvents = await withFreshContext(ctx => fetchFukui(ctx));
    } catch (err) {
      console.error(`[福井] 取得失敗: ${err.message}`);
      fukuiError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      yamanashiEvents = await withFreshContext(ctx => fetchYamanashi(ctx));
    } catch (err) {
      console.error(`[山梨] 取得失敗: ${err.message}`);
      yamanashiError = true;
    }

    // 長野は iCal fetch（Playwright 不要）
    try {
      naganoEvents = await fetchNagano();
    } catch (err) {
      console.error(`[長野] 取得失敗: ${err.message}`);
      naganoError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      gifuEvents = await withFreshContext(ctx => fetchGifu(ctx));
    } catch (err) {
      console.error(`[岐阜] 取得失敗: ${err.message}`);
      gifuError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      shizuokaEvents = await withFreshContext(ctx => fetchShizuoka(ctx));
    } catch (err) {
      console.error(`[静岡] 取得失敗: ${err.message}`);
      shizuokaError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      aichiEvents = await withFreshContext(ctx => fetchAichi(ctx));
    } catch (err) {
      console.error(`[愛知] 取得失敗: ${err.message}`);
      aichiError = true;
    }

    // ── 近畿地本 ──
    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      mieEvents = await withFreshContext(ctx => fetchMie(ctx));
    } catch (err) {
      console.error(`[三重] 取得失敗: ${err.message}`);
      mieError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      shigaEvents = await withFreshContext(ctx => fetchShiga(ctx));
    } catch (err) {
      console.error(`[滋賀] 取得失敗: ${err.message}`);
      shigaError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      kyotoEvents = await withFreshContext(ctx => fetchKyoto(ctx));
    } catch (err) {
      console.error(`[京都] 取得失敗: ${err.message}`);
      kyotoError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      osakaEvents = await withFreshContext(ctx => fetchOsaka(ctx));
    } catch (err) {
      console.error(`[大阪] 取得失敗: ${err.message}`);
      osakaError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      hyogoEvents = await withFreshContext(ctx => fetchHyogo(ctx));
    } catch (err) {
      console.error(`[兵庫] 取得失敗: ${err.message}`);
      hyogoError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      naraEvents = await withFreshContext(ctx => fetchNara(ctx));
    } catch (err) {
      console.error(`[奈良] 取得失敗: ${err.message}`);
      naraError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      wakayamaEvents = await withFreshContext(ctx => fetchWakayama(ctx));
    } catch (err) {
      console.error(`[和歌山] 取得失敗: ${err.message}`);
      wakayamaError = true;
    }

    // ── 四国地本 ──
    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      ehimeEvents = await withFreshContext(ctx => fetchHtmlPref(ctx, '愛媛', URLS.ehime, parseEhime));
    } catch (err) {
      console.error(`[愛媛] 取得失敗: ${err.message}`);
      ehimeError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      kagawaEvents = await withFreshContext(ctx => fetchHtmlPref(ctx, '香川', URLS.kagawa, parseKagawa));
    } catch (err) {
      console.error(`[香川] 取得失敗: ${err.message}`);
      kagawaError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      kochiEvents = await withFreshContext(ctx => fetchHtmlPref(ctx, '高知', URLS.kochi, parseKochi));
    } catch (err) {
      console.error(`[高知] 取得失敗: ${err.message}`);
      kochiError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      tokushimaEvents = await withFreshContext(ctx => fetchHtmlPref(ctx, '徳島', URLS.tokushima, parseTokushima));
    } catch (err) {
      console.error(`[徳島] 取得失敗: ${err.message}`);
      tokushimaError = true;
    }

    // ── 中国地本 ──
    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      tottoriEvents = await withFreshContext(ctx => fetchHtmlPref(ctx, '鳥取', URLS.tottori, parseTottori));
    } catch (err) {
      console.error(`[鳥取] 取得失敗: ${err.message}`);
      tottoriError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      shimaneEvents = await withFreshContext(ctx => fetchHtmlPref(ctx, '島根', URLS.shimane, parseShimane));
    } catch (err) {
      console.error(`[島根] 取得失敗: ${err.message}`);
      shimaneError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      okayamaEvents = await withFreshContext(ctx => fetchHtmlPref(ctx, '岡山', URLS.okayama, parseOkayama));
    } catch (err) {
      console.error(`[岡山] 取得失敗: ${err.message}`);
      okayamaError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      hiroshimaEvents = await withFreshContext(ctx => fetchHtmlPref(ctx, '広島', URLS.hiroshima, parseHiroshima));
    } catch (err) {
      console.error(`[広島] 取得失敗: ${err.message}`);
      hiroshimaError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      yamaguchiEvents = await withFreshContext(ctx => fetchHtmlPref(ctx, '山口', URLS.yamaguchi, parseYamaguchi));
    } catch (err) {
      console.error(`[山口] 取得失敗: ${err.message}`);
      yamaguchiError = true;
    }

    // ── 九州・沖縄地本 ──
    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      fukuokaEvents = await withFreshContext(ctx => fetchHtmlPref(ctx, '福岡', URLS.fukuoka, parseFukuoka));
    } catch (err) {
      console.error(`[福岡] 取得失敗: ${err.message}`);
      fukuokaError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      sagaEvents = await withFreshContext(ctx => fetchHtmlPref(ctx, '佐賀', URLS.saga, parseSaga));
    } catch (err) {
      console.error(`[佐賀] 取得失敗: ${err.message}`);
      sagaError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      nagasakiEvents = await withFreshContext(ctx => fetchHtmlPref(ctx, '長崎', URLS.nagasaki, parseNagasaki));
    } catch (err) {
      console.error(`[長崎] 取得失敗: ${err.message}`);
      nagasakiError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      kumamotoEvents = await withFreshContext(ctx => fetchHtmlPref(ctx, '熊本', URLS.kumamoto, parseKumamoto));
    } catch (err) {
      console.error(`[熊本] 取得失敗: ${err.message}`);
      kumamotoError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      oitaEvents = await withFreshContext(ctx => fetchHtmlPref(ctx, '大分', URLS.oita, parseOita));
    } catch (err) {
      console.error(`[大分] 取得失敗: ${err.message}`);
      oitaError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      miyazakiEvents = await withFreshContext(ctx => fetchHtmlPref(ctx, '宮崎', URLS.miyazaki, parseMiyazaki));
    } catch (err) {
      console.error(`[宮崎] 取得失敗: ${err.message}`);
      miyazakiError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      kagoshimaEvents = await withFreshContext(ctx => fetchHtmlPref(ctx, '鹿児島', URLS.kagoshima, parseKagoshima));
    } catch (err) {
      console.error(`[鹿児島] 取得失敗: ${err.message}`);
      kagoshimaError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 秒待機...`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      okinawaEvents = await withFreshContext(ctx => fetchHtmlPref(ctx, '沖縄', URLS.okinawa, parseOkinawa));
    } catch (err) {
      console.error(`[沖縄] 取得失敗: ${err.message}`);
      okinawaError = true;
    }
  } finally {
    await browser.close();
  }

  // 全地本エラーの場合のみ終了
  const allErrors = [
    sapporoError, asahikawaError, obihiroError, hakodateError,
    miyagiError, aomoriError, iwateError, yamagataError, fukushimaError, akitaError,
    kanagawaError, tokyoError, saitamaError, gunmaError, ibarakiError, chibaError, tochigiError,
    niigataError, toyamaError, ishikawaError, fukuiError, yamanashiError, naganoError,
    gifuError, shizuokaError, aichiError,
    mieError, shigaError, kyotoError, osakaError, hyogoError, naraError, wakayamaError,
    ehimeError, kagawaError, kochiError, tokushimaError,
    tottoriError, shimaneError, okayamaError, hiroshimaError, yamaguchiError,
    fukuokaError, sagaError, nagasakiError, kumamotoError, oitaError,
    miyazakiError, kagoshimaError, okinawaError,
  ];
  if (allErrors.every(Boolean)) {
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

  sapporoEvents   = fallback(sapporoError,   '札幌',   sapporoEvents,   'sapporo');
  asahikawaEvents = fallback(asahikawaError, '旭川',   asahikawaEvents, 'asahikawa');
  obihiroEvents   = fallback(obihiroError,   '帯広',   obihiroEvents,   'obihiro');
  hakodateEvents  = fallback(hakodateError,  '函館',   hakodateEvents,  'hakodate');
  miyagiEvents    = fallback(miyagiError,    '宮城',   miyagiEvents,    'miyagi');
  aomoriEvents    = fallback(aomoriError,    '青森',   aomoriEvents,    'aomori');
  iwateEvents     = fallback(iwateError,     '岩手',   iwateEvents,     'iwate');
  yamagataEvents  = fallback(yamagataError,  '山形',   yamagataEvents,  'yamagata');
  fukushimaEvents = fallback(fukushimaError, '福島',   fukushimaEvents, 'fukushima');
  akitaEvents     = fallback(akitaError,     '秋田',   akitaEvents,     'akita');
  kanagawaEvents  = fallback(kanagawaError,  '神奈川', kanagawaEvents,  'kanagawa');
  tokyoEvents     = fallback(tokyoError,     '東京',   tokyoEvents,     'tokyo');
  saitamaEvents   = fallback(saitamaError,   '埼玉',   saitamaEvents,   'saitama');
  gunmaEvents     = fallback(gunmaError,     '群馬',   gunmaEvents,     'gunma');
  ibarakiEvents   = fallback(ibarakiError,   '茨城',   ibarakiEvents,   'ibaraki');
  chibaEvents     = fallback(chibaError,     '千葉',   chibaEvents,     'chiba');
  tochigiEvents   = fallback(tochigiError,   '栃木',   tochigiEvents,   'tochigi');
  niigataEvents   = fallback(niigataError,   '新潟',   niigataEvents,   'niigata');
  toyamaEvents    = fallback(toyamaError,    '富山',   toyamaEvents,    'toyama');
  ishikawaEvents  = fallback(ishikawaError,  '石川',   ishikawaEvents,  'ishikawa');
  fukuiEvents     = fallback(fukuiError,     '福井',   fukuiEvents,     'fukui');
  yamanashiEvents = fallback(yamanashiError, '山梨',   yamanashiEvents, 'yamanashi');
  naganoEvents    = fallback(naganoError,    '長野',   naganoEvents,    'nagano');
  gifuEvents      = fallback(gifuError,      '岐阜',   gifuEvents,      'gifu');
  shizuokaEvents  = fallback(shizuokaError,  '静岡',   shizuokaEvents,  'shizuoka');
  aichiEvents     = fallback(aichiError,     '愛知',   aichiEvents,     'aichi');
  mieEvents       = fallback(mieError,       '三重',   mieEvents,       'mie');
  shigaEvents     = fallback(shigaError,     '滋賀',   shigaEvents,     'shiga');
  kyotoEvents     = fallback(kyotoError,     '京都',   kyotoEvents,     'kyoto');
  osakaEvents     = fallback(osakaError,     '大阪',   osakaEvents,     'osaka');
  hyogoEvents     = fallback(hyogoError,     '兵庫',   hyogoEvents,     'hyogo');
  naraEvents      = fallback(naraError,      '奈良',   naraEvents,      'nara');
  wakayamaEvents  = fallback(wakayamaError,  '和歌山', wakayamaEvents,  'wakayama');

  // ── 近畿WP系地本: チラシ（PDF/画像）から日付・タイトルを OCR で補完 ──
  mieEvents      = await enrichFromFlyer(mieEvents,      '三重');
  shigaEvents    = await enrichFromFlyer(shigaEvents,    '滋賀');
  naraEvents     = await enrichFromFlyer(naraEvents,     '奈良');
  wakayamaEvents = await enrichFromFlyer(wakayamaEvents, '和歌山');
  ehimeEvents     = fallback(ehimeError,     '愛媛',   ehimeEvents,     'ehime');
  kagawaEvents    = fallback(kagawaError,    '香川',   kagawaEvents,    'kagawa');
  kochiEvents     = fallback(kochiError,     '高知',   kochiEvents,     'kochi');
  tokushimaEvents = fallback(tokushimaError, '徳島',   tokushimaEvents, 'tokushima');
  tottoriEvents   = fallback(tottoriError,   '鳥取',   tottoriEvents,   'tottori');
  shimaneEvents   = fallback(shimaneError,   '島根',   shimaneEvents,   'shimane');
  okayamaEvents   = fallback(okayamaError,   '岡山',   okayamaEvents,   'okayama');
  hiroshimaEvents = fallback(hiroshimaError, '広島',   hiroshimaEvents, 'hiroshima');
  yamaguchiEvents = fallback(yamaguchiError, '山口',   yamaguchiEvents, 'yamaguchi');
  fukuokaEvents   = fallback(fukuokaError,   '福岡',   fukuokaEvents,   'fukuoka');
  sagaEvents      = fallback(sagaError,      '佐賀',   sagaEvents,      'saga');
  nagasakiEvents  = fallback(nagasakiError,  '長崎',   nagasakiEvents,  'nagasaki');
  kumamotoEvents  = fallback(kumamotoError,  '熊本',   kumamotoEvents,  'kumamoto');
  oitaEvents      = fallback(oitaError,      '大分',   oitaEvents,      'oita');
  miyazakiEvents  = fallback(miyazakiError,  '宮崎',   miyazakiEvents,  'miyazaki');
  kagoshimaEvents = fallback(kagoshimaError, '鹿児島', kagoshimaEvents, 'kagoshima');
  okinawaEvents   = fallback(okinawaError,   '沖縄',   okinawaEvents,   'okinawa');

  // ── PDF OCR（ev.url が .pdf のイベントを対象） ──
  iwateEvents  = await enrichWithPdfOcr(iwateEvents);
  aomoriEvents = await enrichWithPdfOcr(aomoriEvents);

  // ── 画像 OCR（全地本対象）──
  // imageUrl または url が画像ファイルのイベントのみ実行。それ以外はパススルーで無害。
  sapporoEvents   = await enrichWithOcr(sapporoEvents);
  asahikawaEvents = await enrichWithOcr(asahikawaEvents);
  obihiroEvents   = await enrichWithOcr(obihiroEvents);
  hakodateEvents  = await enrichWithOcr(hakodateEvents);
  miyagiEvents    = await enrichWithOcr(miyagiEvents);
  yamagataEvents  = await enrichWithOcr(yamagataEvents);
  fukushimaEvents = await enrichWithOcr(fukushimaEvents);
  akitaEvents     = await enrichWithOcr(akitaEvents);
  kanagawaEvents  = await enrichWithOcr(kanagawaEvents);
  tokyoEvents     = await enrichWithOcr(tokyoEvents);
  saitamaEvents   = await enrichWithOcr(saitamaEvents);
  gunmaEvents     = await enrichWithOcr(gunmaEvents);
  tochigiEvents   = await enrichWithOcr(tochigiEvents);
  ibarakiEvents   = await enrichWithOcr(ibarakiEvents);
  chibaEvents     = await enrichWithOcr(chibaEvents);
  niigataEvents   = await enrichWithOcr(niigataEvents);
  toyamaEvents    = await enrichWithOcr(toyamaEvents);
  ishikawaEvents  = await enrichWithOcr(ishikawaEvents);
  fukuiEvents     = await enrichWithOcr(fukuiEvents);
  yamanashiEvents = await enrichWithOcr(yamanashiEvents);
  naganoEvents    = await enrichWithOcr(naganoEvents);
  gifuEvents      = await enrichWithOcr(gifuEvents);
  shizuokaEvents  = await enrichWithOcr(shizuokaEvents);
  aichiEvents     = await enrichWithOcr(aichiEvents);
  mieEvents       = await enrichWithOcr(mieEvents);
  shigaEvents     = await enrichWithOcr(shigaEvents);
  kyotoEvents     = await enrichWithOcr(kyotoEvents);
  osakaEvents     = await enrichWithOcr(osakaEvents);
  hyogoEvents     = await enrichWithOcr(hyogoEvents);
  naraEvents      = await enrichWithOcr(naraEvents);
  wakayamaEvents  = await enrichWithOcr(wakayamaEvents);
  ehimeEvents     = await enrichWithOcr(ehimeEvents);
  kagawaEvents    = await enrichWithOcr(kagawaEvents);
  kochiEvents     = await enrichWithOcr(kochiEvents);
  tokushimaEvents = await enrichWithOcr(tokushimaEvents);
  tottoriEvents   = await enrichWithOcr(tottoriEvents);
  shimaneEvents   = await enrichWithOcr(shimaneEvents);
  okayamaEvents   = await enrichWithOcr(okayamaEvents);
  hiroshimaEvents = await enrichWithOcr(hiroshimaEvents);
  yamaguchiEvents = await enrichWithOcr(yamaguchiEvents);
  fukuokaEvents   = await enrichWithOcr(fukuokaEvents);
  sagaEvents      = await enrichWithOcr(sagaEvents);
  nagasakiEvents  = await enrichWithOcr(nagasakiEvents);
  kumamotoEvents  = await enrichWithOcr(kumamotoEvents);
  oitaEvents      = await enrichWithOcr(oitaEvents);
  miyazakiEvents  = await enrichWithOcr(miyazakiEvents);
  kagoshimaEvents = await enrichWithOcr(kagoshimaEvents);
  okinawaEvents   = await enrichWithOcr(okinawaEvents);

  // imageUrl は最終出力に含めない（内部用フィールド）
  const strip = ev => { const { imageUrl: _, _flyerUrl: __, ...rest } = ev; return rest; };

  const output = {
    sapporo:   sapporoEvents.map(strip),
    asahikawa: asahikawaEvents.map(strip),
    obihiro:   obihiroEvents.map(strip),
    hakodate:  hakodateEvents.map(strip),
    miyagi:    miyagiEvents.map(strip),
    aomori:    aomoriEvents.map(strip),
    iwate:     iwateEvents.map(strip),
    yamagata:  yamagataEvents.map(strip),
    fukushima: fukushimaEvents.map(strip),
    akita:     akitaEvents.map(strip),
    kanagawa:  kanagawaEvents.map(strip),
    tokyo:     tokyoEvents.map(strip),
    saitama:   saitamaEvents.map(strip),
    gunma:     gunmaEvents.map(strip),
    tochigi:   tochigiEvents.map(strip),
    ibaraki:   ibarakiEvents.map(strip),
    chiba:     chibaEvents.map(strip),
    niigata:   niigataEvents.map(strip),
    toyama:    toyamaEvents.map(strip),
    ishikawa:  ishikawaEvents.map(strip),
    fukui:     fukuiEvents.map(strip),
    yamanashi: yamanashiEvents.map(strip),
    nagano:    naganoEvents.map(strip),
    gifu:      gifuEvents.map(strip),
    shizuoka:  shizuokaEvents.map(strip),
    aichi:     aichiEvents.map(strip),
    mie:       mieEvents.map(strip),
    shiga:     shigaEvents.map(strip),
    kyoto:     kyotoEvents.map(strip),
    osaka:     osakaEvents.map(strip),
    hyogo:     hyogoEvents.map(strip),
    nara:      naraEvents.map(strip),
    wakayama:  wakayamaEvents.map(strip),
    ehime:     ehimeEvents.map(strip),
    kagawa:    kagawaEvents.map(strip),
    kochi:     kochiEvents.map(strip),
    tokushima: tokushimaEvents.map(strip),
    tottori:   tottoriEvents.map(strip),
    shimane:   shimaneEvents.map(strip),
    okayama:   okayamaEvents.map(strip),
    hiroshima: hiroshimaEvents.map(strip),
    yamaguchi: yamaguchiEvents.map(strip),
    fukuoka:   fukuokaEvents.map(strip),
    saga:      sagaEvents.map(strip),
    nagasaki:  nagasakiEvents.map(strip),
    kumamoto:  kumamotoEvents.map(strip),
    oita:      oitaEvents.map(strip),
    miyazaki:  miyazakiEvents.map(strip),
    kagoshima: kagoshimaEvents.map(strip),
    okinawa:   okinawaEvents.map(strip),
    updatedAt: nowJST(),
  };
  // OCRキャッシュを保存（スキャン済みURLを記録 → 次回以降の再スキャンを防ぐ）
  saveOcrCache();

  writeOutput(output);
  // 新規イベントを検出してプッシュ通知（非同期・失敗しても続行）
  await notifyNewEvents(prev, output).catch(err =>
    console.warn('[Push] notifyNewEvents エラー:', err.message)
  );
}

/** public/data/events.json に書き出す */
function writeOutput(data) {
  // ディレクトリが無ければ作成
  const dir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // 今日（JST）より前の日付のイベントを削除
  const jstNow = new Date(Date.now() + 9 * 3600 * 1000);
  const today = jstNow.toISOString().slice(0, 10); // "YYYY-MM-DD"
  let removedCount = 0;
  for (const key of Object.keys(data)) {
    if (!Array.isArray(data[key])) continue;
    const before = data[key].length;
    data[key] = data[key].filter(ev => {
      if (!ev.date) return false;
      if ((ev.endDate || ev.date) < today) return false;
      // タイトルが「お知らせ」のみ等、内容のないゴミデータを除外
      if (!ev.title || /^お知らせ$/.test(ev.title.trim())) return false;
      return true;
    });
    removedCount += before - data[key].length;
    // 曜日をカレンダーデータで上書き
    data[key].forEach(ev => {
      if (ev.date)    ev.weekday    = calcWeekday(ev.date);
      if (ev.endDate) ev.endWeekday = calcWeekday(ev.endDate);
    });
  }
  if (removedCount > 0) console.log(`[フィルタ] 過去イベント ${removedCount} 件を削除`);

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(data, null, 2), 'utf8');
  console.log(`[出力] ${OUTPUT_PATH}`);
  console.log(`  札幌:   ${(data.sapporo   ?? []).length} 件`);
  console.log(`  旭川:   ${(data.asahikawa ?? []).length} 件`);
  console.log(`  帯広:   ${(data.obihiro   ?? []).length} 件`);
  console.log(`  函館:   ${(data.hakodate  ?? []).length} 件`);
  console.log(`  宮城:   ${(data.miyagi    ?? []).length} 件`);
  console.log(`  青森:   ${(data.aomori   ?? []).length} 件`);
  console.log(`  岩手:   ${(data.iwate    ?? []).length} 件`);
  console.log(`  山形:   ${(data.yamagata  ?? []).length} 件`);
  console.log(`  福島:   ${(data.fukushima ?? []).length} 件`);
  console.log(`  秋田:   ${(data.akita     ?? []).length} 件`);
  console.log(`  神奈川: ${(data.kanagawa  ?? []).length} 件`);
  console.log(`  東京:   ${(data.tokyo     ?? []).length} 件`);
  console.log(`  埼玉:   ${(data.saitama   ?? []).length} 件`);
  console.log(`  群馬:   ${(data.gunma     ?? []).length} 件`);
  console.log(`  栃木:   ${(data.tochigi   ?? []).length} 件`);
  console.log(`  茨城:   ${(data.ibaraki   ?? []).length} 件`);
  console.log(`  千葉:   ${(data.chiba     ?? []).length} 件`);
  console.log(`  新潟:   ${(data.niigata   ?? []).length} 件`);
  console.log(`  富山:   ${(data.toyama    ?? []).length} 件`);
  console.log(`  石川:   ${(data.ishikawa  ?? []).length} 件`);
  console.log(`  福井:   ${(data.fukui     ?? []).length} 件`);
  console.log(`  山梨:   ${(data.yamanashi ?? []).length} 件`);
  console.log(`  長野:   ${(data.nagano    ?? []).length} 件`);
  console.log(`  岐阜:   ${(data.gifu      ?? []).length} 件`);
  console.log(`  静岡:   ${(data.shizuoka  ?? []).length} 件`);
  console.log(`  愛知:   ${(data.aichi     ?? []).length} 件`);
  console.log(`  三重:   ${(data.mie       ?? []).length} 件`);
  console.log(`  滋賀:   ${(data.shiga     ?? []).length} 件`);
  console.log(`  京都:   ${(data.kyoto     ?? []).length} 件`);
  console.log(`  大阪:   ${(data.osaka     ?? []).length} 件`);
  console.log(`  兵庫:   ${(data.hyogo     ?? []).length} 件`);
  console.log(`  奈良:   ${(data.nara      ?? []).length} 件`);
  console.log(`  和歌山: ${(data.wakayama  ?? []).length} 件`);
  console.log(`  愛媛:   ${(data.ehime     ?? []).length} 件`);
  console.log(`  香川:   ${(data.kagawa    ?? []).length} 件`);
  console.log(`  高知:   ${(data.kochi     ?? []).length} 件`);
  console.log(`  徳島:   ${(data.tokushima ?? []).length} 件`);
  console.log(`  鳥取:   ${(data.tottori   ?? []).length} 件`);
  console.log(`  島根:   ${(data.shimane   ?? []).length} 件`);
  console.log(`  岡山:   ${(data.okayama   ?? []).length} 件`);
  console.log(`  広島:   ${(data.hiroshima ?? []).length} 件`);
  console.log(`  山口:   ${(data.yamaguchi ?? []).length} 件`);
  console.log(`  福岡:   ${(data.fukuoka   ?? []).length} 件`);
  console.log(`  佐賀:   ${(data.saga      ?? []).length} 件`);
  console.log(`  長崎:   ${(data.nagasaki  ?? []).length} 件`);
  console.log(`  熊本:   ${(data.kumamoto  ?? []).length} 件`);
  console.log(`  大分:   ${(data.oita      ?? []).length} 件`);
  console.log(`  宮崎:   ${(data.miyazaki  ?? []).length} 件`);
  console.log(`  鹿児島: ${(data.kagoshima ?? []).length} 件`);
  console.log(`  沖縄:   ${(data.okinawa   ?? []).length} 件`);
  console.log(`  更新時刻: ${data.updatedAt}`);

  // AIクローラー向け静的 HTML を再生成
  try {
    const { execSync } = require('child_process');
    execSync('node ../scripts/generate-events-html.mjs', { cwd: __dirname, stdio: 'inherit' });
  } catch (e) {
    console.warn('[警告] events.html 生成に失敗しました:', e.message);
  }
}

// ── 新規イベント検出 → Web Push 通知 ─────────────────────────
/**
 * 前回データと新データを比較し、新しく追加されたイベントがあれば
 * /api/notify に POST してプッシュ通知を送信する。
 *
 * 必要な環境変数:
 *   SITE_URL       – デプロイ先 URL (例: https://jsdf-events.vercel.app)
 *   NOTIFY_SECRET  – API 認証シークレット
 *
 * いずれかが未設定の場合は何もしない（ローカル開発時など）。
 */
async function notifyNewEvents(prevData, newData) {
  const siteUrl     = process.env.SITE_URL;
  const notifSecret = process.env.NOTIFY_SECRET;
  if (!siteUrl || !notifSecret) {
    console.log('[Push] SITE_URL / NOTIFY_SECRET 未設定のため通知をスキップします');
    return;
  }

  // 前回の全イベント ID セットを構築
  const prevIds = new Set();
  for (const key of Object.keys(prevData)) {
    if (!Array.isArray(prevData[key])) continue;
    for (const ev of prevData[key]) {
      if (ev.id) prevIds.add(ev.id);
    }
  }

  // 新規イベントを収集
  const newEvents = [];
  for (const key of Object.keys(newData)) {
    if (!Array.isArray(newData[key])) continue;
    for (const ev of newData[key]) {
      if (ev.id && !prevIds.has(ev.id)) newEvents.push(ev);
    }
  }

  if (newEvents.length === 0) {
    console.log('[Push] 新規イベントなし。通知をスキップします');
    return;
  }

  console.log(`[Push] 新規イベント ${newEvents.length} 件を検出。通知を送信します`);

  // 代表イベントで通知テキストを作成（最大3件）
  const sample  = newEvents.slice(0, 3);
  const title   = `自衛隊イベント情報 +${newEvents.length}件`;
  const body    = sample.map(e => `・${e.title} (${e.date})`).join('\n')
                + (newEvents.length > 3 ? `\n他 ${newEvents.length - 3} 件…` : '');
  const url     = '/';

  const payload = JSON.stringify({ title, body, url });
  const apiUrl  = new URL('/api/notify', siteUrl);

  const https = require('https');
  const http  = require('http');
  const lib   = apiUrl.protocol === 'https:' ? https : http;

  await new Promise((resolve) => {
    const req = lib.request(
      {
        hostname: apiUrl.hostname,
        port:     apiUrl.port || (apiUrl.protocol === 'https:' ? 443 : 80),
        path:     apiUrl.pathname,
        method:   'POST',
        headers: {
          'Content-Type':     'application/json',
          'Content-Length':   Buffer.byteLength(payload),
          'x-notify-secret':  notifSecret,
        },
      },
      res => {
        let body = '';
        res.on('data', c => { body += c; });
        res.on('end', () => {
          console.log(`[Push] API 応答 ${res.statusCode}: ${body}`);
          resolve();
        });
      }
    );
    req.on('error', err => {
      console.warn('[Push] API 呼び出しに失敗しました:', err.message);
      resolve();
    });
    req.write(payload);
    req.end();
  });
}

// ── エントリーポイント ────────────────────────────────────────
main().catch(err => {
  console.error('[致命的エラー]', err);
  process.exit(1);
});

