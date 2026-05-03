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
const { parseAichi }         = require('./parsers/aichi');
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
const { toHalfWidth, reiwaToAD, padTwo, isPast, guessCategory, guessTag, calcWeekday } = require('./parsers/utils');

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

// ── PDF OCR（PDF 系地本の標準パターン） ────────────────────────
// PDF 運営地本（岩手・青森など）に使用。ev.url が .pdf のイベントを対象にする。

const PDF_OCR_PROMPT = `この自衛隊イベントのPDFから情報を抽出してください。
以下のJSONのみを返してください（説明文不要）。該当情報がない項目はnullにしてください。
{
  "title": "PDFに書かれた正確なイベント名",
  "place": "開催場所・会場名（施設名・住所など）",
  "time": "開催時間（例: 10:00～16:00）",
  "ageRequirement": "参加対象年齢や応募資格（例: 18歳〜32歳未満）",
  "deadline": "応募締切日（例: 4月24日（金））",
  "notes": "実施内容・参加条件・注意事項など"
}`;

/**
 * PDF URL を受け取り、Claude Haiku で OCR して JSON を返す。
 * ANTHROPIC_API_KEY が未設定の場合は null を返す（OCR スキップ）。
 */
async function ocrPdf(pdfUrl) {
  if (!process.env.ANTHROPIC_API_KEY || !pdfUrl) return null;

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

    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'x-api-key':         process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta':    'pdfs-2024-09-25',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{
          role:    'user',
          content: [
            {
              type:   'document',
              source: { type: 'base64', media_type: 'application/pdf', data: base64 },
            },
            { type: 'text', text: PDF_OCR_PROMPT },
          ],
        }],
      }),
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.warn(`[PDF-OCR] API エラー (${apiRes.status}): ${errText.slice(0, 100)}`);
      return null;
    }

    const apiJson   = await apiRes.json();
    const text      = apiJson.content?.[0]?.text ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);

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
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('[PDF-OCR] ANTHROPIC_API_KEY 未設定のためスキップ');
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

    await sleep(500);
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
const fetchAichi     = (ctx) => fetchHtmlPref(ctx, '愛知', URLS.aichi,     parseAichi);
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
async function fetchWpPosts(ctx, pref, listUrl, urlsFn, postFn, maxPosts = 5) {
  console.log(`[${pref}] 一覧ページ取得: ${listUrl}`);
  let postUrls = [];

  // ── 一覧ページ ──
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
  } catch (err) {
    console.warn(`[${pref}] 一覧ページ失敗: ${err.message.substring(0, 60)}`);
  } finally {
    await listPage.close();
  }

  if (postUrls.length === 0) return [];

  // ── 各投稿ページ ──
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
      if (evs.length) console.log(`[${pref}] ${postUrl.split('/').slice(-2,-1)[0]} → ${evs[0].date} ${evs[0].title.substring(0,30)}`);
      events.push(...evs);
    } catch (err) {
      console.warn(`[${pref}] 投稿取得失敗: ${err.message.substring(0, 60)}`);
    } finally {
      await postPage.close();
    }
    await sleep(1500);
  }

  console.log(`[${pref}] ${events.length} 件取得`);
  return events;
}

const fetchMie      = (ctx) => fetchWpPosts(ctx, '三重',   URLS.mie,      parseMiePostUrls,      parseMiePost,      5);
const fetchShiga    = (ctx) => fetchWpPosts(ctx, '滋賀',   URLS.shiga,    parseShigaPostUrls,    parseShigaPost,    5);
const fetchNara     = (ctx) => fetchWpPosts(ctx, '奈良',   URLS.nara,     parseNaraPostUrls,     parseNaraPost,     5);
const fetchWakayama = (ctx) => fetchWpPosts(ctx, '和歌山', URLS.wakayama, parseWakayamaPostUrls, parseWakayamaPost, 5);

/**
 * 兵庫地本: TOP ページからイベントバナー画像を取得し OCR でイベントを抽出する。
 * ANTHROPIC_API_KEY 未設定の場合は空配列を返す。
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

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('[兵庫] ANTHROPIC_API_KEY 未設定のため OCR スキップ');
    return [];
  }
  if (imageUrls.length === 0) return [];

  const events = [];
  let idx = 0;
  for (const imgUrl of imageUrls) {
    console.log(`[兵庫 OCR] ${imgUrl}`);
    const ocr = await ocrImageFull(imgUrl);
    if (!ocr) continue;

    const rawDate = toHalfWidth((ocr.date || '').replace(/\s+/g, ' ').trim());
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

    const title = ocr.title ? fixOcrTitle(ocr.title.trim()) : '';
    if (!title) continue;

    events.push({
      id:             `hy-${dateStr.replace(/-/g, '')}-${++idx}`,
      pref:           'hyogo',
      date:           dateStr,
      weekday,
      title,
      place:          (ocr.place          || '').trim(),
      address:        '',
      time:           (ocr.time           || '').trim(),
      category:       guessCategory(toHalfWidth(title)),
      tag:            guessTag(title),
      url:            URLS.hyogo,
      notes:          ocr.notes          || null,
      ageRequirement: ocr.ageRequirement || null,
      deadline:       ocr.deadline       || null,
      imageUrl:       '',
    });

    await sleep(500);
  }

  console.log(`[兵庫] ${events.length} 件取得 (OCR)`);
  return events.sort((a, b) => a.date.localeCompare(b.date));
}

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

/**
 * 富山地本ページを取得し、JPG ポスターを OCR してイベント一覧を返す。
 * ANTHROPIC_API_KEY 未設定の場合は空配列を返す（OCR スキップ）。
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

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('[富山] ANTHROPIC_API_KEY 未設定のため OCR スキップ');
    return [];
  }
  if (imageUrls.length === 0) return [];

  const events = [];
  let idx = 0;
  for (const imgUrl of imageUrls) {
    console.log(`[富山 OCR] ${imgUrl}`);
    const ocr = await ocrImageFull(imgUrl);
    if (!ocr) continue;

    const rawDate = toHalfWidth((ocr.date || '').replace(/\s+/g, ' ').trim());
    const dtMatch = rawDate.match(/令和(\d+)年(\d+)月(\d+)日[（(]([月火水木金土日祝・]+)[）)]/);
    if (!dtMatch) { console.warn(`[富山 OCR] 日付パース失敗: "${ocr.date}"`); continue; }

    const year    = reiwaToAD(parseInt(dtMatch[1], 10));
    const dateStr = `${year}-${padTwo(parseInt(dtMatch[2], 10))}-${padTwo(parseInt(dtMatch[3], 10))}`;
    if (isPast(dateStr)) continue;

    const title = ocr.title ? fixOcrTitle(ocr.title.trim()) : '';
    if (!title) continue;

    events.push({
      id:             `to-${dateStr.replace(/-/g, '')}-${++idx}`,
      pref:           'toyama',
      date:           dateStr,
      weekday:        dtMatch[4],
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
      imageUrl:       '',
    });

    await sleep(500);
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

  // ── PDF OCR（PDF 系地本：ev.url が .pdf のイベントを対象） ──
  // 新規 PDF 系地本を追加する際はここに同様の行を追加する
  iwateEvents  = await enrichWithPdfOcr(iwateEvents);
  aomoriEvents = await enrichWithPdfOcr(aomoriEvents);

  // ── 画像 OCR（imageUrl がある HTML パーサー結果のみ対象） ──
  tokyoEvents    = await enrichWithOcr(tokyoEvents);
  saitamaEvents  = await enrichWithOcr(saitamaEvents);
  gunmaEvents    = await enrichWithOcr(gunmaEvents);
  ibarakiEvents  = await enrichWithOcr(ibarakiEvents);
  chibaEvents    = await enrichWithOcr(chibaEvents);
  // tochigi/toyama は fetch 内で OCR 済み（imageUrl が空なので enrichWithOcr は無害）

  // imageUrl は最終出力に含めない（内部用フィールド）
  const strip = ev => { const { imageUrl: _, ...rest } = ev; return rest; };

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
  writeOutput(output);
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
    data[key] = data[key].filter(ev => !ev.date || (ev.endDate || ev.date) >= today);
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

// ── エントリーポイント ────────────────────────────────────────
main().catch(err => {
  console.error('[致命的エラー]', err);
  process.exit(1);
});

