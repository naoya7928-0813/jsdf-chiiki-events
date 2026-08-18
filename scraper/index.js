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

const path      = require('path');
const fs        = require('fs');
const fsp       = fs.promises;
const crypto    = require('crypto');
const os        = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const iconv     = require('iconv-lite');
const cheerio   = require('cheerio');

const assetCache  = require('./lib/assetCache');
const { normalizeUrl, isAssetUrl, isPdfUrl } = require('./lib/normalizeUrl');
const { sortByPriority } = require('./lib/priority');
const { markDuplicates }  = require('./lib/dedup');
const { extractAssets }   = require('./lib/extractAssets');
const { findEventLinks }  = require('./lib/exploreLinks');
// OCRテキストからの日付抽出（表記ゆれ吸収。parseTextToEvent / parseOcrDate 共通）
const { parseDateFromText, toJpDateString } = require('./lib/ocrDate');
// OCR モデルIDの実行時解決（プロバイダ側の廃止に自動追従）
const { OcrModelResolver, isModelGoneError, discoverGroqModel, discoverGeminiModel } = require('./lib/ocrModel');
const geocode             = require('./lib/geocode');
// 募集案内所イベントのタイトル整形・非イベント判定（フロント/スクリプトと共通）
const { officeIsJunk, cleanOfficeTitle, cleanOfficePlace, stripTrailingCta } = require('../shared/officeTitle.cjs');
// イベント名の品質管理（検証済み修正・整形・junk判定・年ズレ判定・重複統合）。最終出力の防御に使う
const { applyVerifiedOverrides, cleanEventTitle, cleanPlaceText, splitPlaceAddress, cleanTimeText, cleanDeadlineText, isJunkOrStubTitle, isSuspiciousTitle, isStaleDatedEvent, dedupEvents, isArchivableEvent } = require('../shared/titleQuality.cjs');
// 受付終了/中止の状態判定・締切日解決（誤判定防止つき。shared/eventStatus.cjs）
const eventStatus = require('../shared/eventStatus.cjs');

const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const { parseKanagawa }      = require('./parsers/kanagawa');
const { parseTokyo }         = require('./parsers/tokyo');
const { parseSaitama }       = require('./parsers/saitama');
const { parseGunma }         = require('./parsers/gunma');
const { parseIbaraki, parseIbarakiSetsumeikai } = require('./parsers/ibaraki');
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
const { parseKyoto, parseKyotoSetsumeikai }   = require('./parsers/kyoto');
const { parseOsaka, parseOsakaSession }       = require('./parsers/osaka');
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
const { parseHiroshima, parseHiroshimaDetail } = require('./parsers/hiroshima');
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
const { toHalfWidth, reiwaToAD, reiwaNum, resolveYearByWeekday, HEISEI_BASE, padTwo, isPast, guessCategory, guessTag, calcWeekday, titleHash } = require('./parsers/utils');

// ── 設定 ─────────────────────────────────────────────────────
const OUTPUT_PATH = path.join(__dirname, '../public/data/events.json');
const OFFICES_PATH = path.join(__dirname, '../public/data/offices.json');
// 検疫: 「疑わしい」タイトルのイベントを公開せず隔離する先（git コミット・管理者レビュー用）。
// 新種のゴミパターンがルール追加まで公開され続けた事故（2026-07-03 岩手）の再発防止。
const QUARANTINE_PATH = path.join(__dirname, '../public/data/events-quarantine.json');
// Web Push ペイロード（git管理外）。スクレイパーは書き出しのみ行い、送信は
// scrape.yml の「CDN 伝播待機」後のステップが行う（Issue #16: デプロイ前に通知が
// 届くと、タップ時にまだ旧データが表示される問題の解消）。
const PUSH_PAYLOAD_PATH = path.join(__dirname, 'push-payload.json');
// 過去イベントの恒久ログ（events.json は終了7日で削除するため、退避先として git 管理でコミット）。
// 運営サイトの「過去イベント」から終了後もずっと閲覧できるようにする。
const ARCHIVE_PATH = path.join(__dirname, '../public/data/events-archive.json');
// 保持設定（環境変数で調整可）。既定: 開催日が約2年以内、かつ最大2万件。
const ARCHIVE_RETENTION_DAYS = Number.parseInt(process.env.ARCHIVE_RETENTION_DAYS || '', 10) || 730;
const ARCHIVE_MAX = Number.parseInt(process.env.ARCHIVE_MAX || '', 10) || 20000;

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
  saitamaJobFair: 'https://www.mod.go.jp/pco/saitama/job-fair/',
  gunma:     'https://www.mod.go.jp/pco/gunma/event.html',
  tochigi:   'https://www.mod.go.jp/pco/tochigi/',
  ibaraki:   'https://www.mod.go.jp/pco/ibaraki/event.html',
  ibarakiSetsumeikai: 'https://www.mod.go.jp/pco/ibaraki/setsumeikai.html',
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
  kyotoSetsumeikai: 'https://www.mod.go.jp/pco/kyoto/boshuka/jieikan/setsumeikai.html',
  osaka:     'https://www.mod.go.jp/pco/osaka/experience/event.html',
  osakaSession: 'https://www.mod.go.jp/pco/osaka/recruit/session/menu.html',
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

// ── OCR キャッシュ（lib/assetCache に委譲） ───────────────────
// ocr-cache.json は .gitignore 対象。GitHub Actions cache で永続化。
assetCache.load();

// ── モックデータ（--mock 時に使用） ───────────────────────────
const MOCK_DATA = {
  kanagawa: [
    { id: 'k-20260425-1', date: '2026-06-10', weekday: '土', title: '自衛官候補生 募集説明会', place: '横浜地域事務所', address: '横浜市中区山下町1-2', time: '13:30～15:30', category: '説明会', tag: '要予約', url: '', notes: '参加には事前予約が必要です。' },
    { id: 'k-20260429-1', date: '2026-06-15', weekday: '水・祝', title: '横須賀地方総監部 一般公開', place: '海上自衛隊 横須賀基地', address: '横須賀市西逸見町1丁目', time: '09:00～16:00', category: '一般公開', tag: '入場無料', url: '', notes: null },
    { id: 'k-20260505-1', date: '2026-06-20', weekday: '火・祝', title: '子ども自衛隊体験デー', place: '陸上自衛隊 武山駐屯地', address: '横須賀市御幸浜1-1', time: '10:00～15:00', category: '体験', tag: '家族向け', url: '', notes: null },
  ],
  tokyo: [
    { id: 't-20260426-1', date: '2026-06-11', weekday: '日', title: '自衛官候補生 採用試験説明会', place: '市ヶ谷駐屯地 厚生センター', address: '新宿区市谷本村町5-1', time: '10:00～12:00', category: '説明会', tag: '要予約', url: '', notes: null },
    { id: 't-20260502-1', date: '2026-06-25', weekday: '土', title: '練馬駐屯地 創立記念行事', place: '陸上自衛隊 練馬駐屯地', address: '練馬区北町4-1-1', time: '09:00～15:00', category: '記念行事', tag: '入場無料', url: '', notes: null },
  ],
  saitama: [
    { id: 's-20260519-1', pref: 'saitama', date: '2026-06-12', weekday: '火', title: '陸上自衛隊 朝霞駐屯地 見学会', place: '陸上自衛隊 朝霞駐屯地', address: '', time: '10:00～12:00', category: '見学', tag: '要予約', url: '', notes: null },
  ],
  gunma: [
    { id: 'gu-20260618-1', pref: 'gunma', date: '2026-06-18', weekday: '木', title: '陸上自衛隊 相馬原駐屯地 見学会', place: '相馬原駐屯地', address: '', time: '10:00～12:00', category: '見学', tag: '要予約', url: '', notes: null },
  ],
  tochigi:   [],
  ibaraki: [
    { id: 'ib-20260614-1', pref: 'ibaraki', date: '2026-06-14', weekday: '日', title: '土浦駐屯地 見学会', place: '陸上自衛隊 土浦駐屯地', address: '', time: '10:00～12:00', category: '見学', tag: '要予約', url: '', notes: null },
  ],
  chiba: [
    { id: 'cb-20260613-1', pref: 'chiba', date: '2026-06-13', weekday: '土', title: '習志野駐屯地 見学会', place: '陸上自衛隊 習志野駐屯地', address: '', time: '10:00～12:00', category: '見学', tag: '要予約', url: '', notes: null },
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

// ── OCR パイプライン共通ユーティリティ ─────────────────────────

// 2026-08-18 に apt ミラーのハングで定期実行が 130 分のジョブ上限に達し、
// スクレイプが 1 行も走らないまま通知スロットを 1 回落とした。ネットワーク
// 待ちは「必ず有限時間で諦める」ことを全経路の前提にする。
// 不正値（空文字・非数値）でも必ず有効なミリ秒に落とす。
// AbortSignal.timeout(NaN) は例外になり、全ダウンロードが死ぬ。
const DEFAULT_FETCH_TIMEOUT_MS = (() => {
  const n = Number.parseInt(process.env.FETCH_TIMEOUT_MS || '', 10);
  return Number.isFinite(n) && n > 0 ? n : 45_000;
})();

/**
 * fetch にタイムアウトを付ける。既定 45 秒。
 * AbortSignal.timeout は Node 18+ で利用可能（本番は Node 22）。
 * 呼び出し側で signal を明示している場合はそちらを優先する。
 */
function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  if (options.signal) return fetch(url, options);
  return fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
}

/** ファイルバッファの SHA-256 ハッシュを返す（OCRキャッシュのキーに使用） */
function hashBuffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * URL からファイルをダウンロードしてバッファ・ハッシュ・MIMEを返す。
 * 既存キャッシュの ETag / Last-Modified を使って条件付きGETを発行し、
 * 304 Not Modified なら実ダウンロードをスキップする。
 *
 * @returns {{ buf: Buffer|null, hash: string, mime: string, notModified: boolean }|null}
 */
async function downloadFile(url) {
  const normUrl  = normalizeUrl(url);
  const existing = normUrl ? assetCache.getByUrl(normUrl) : null;

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer':    'https://www.mod.go.jp/',
  };
  // OCR成功済みエントリのみ条件付きGET（未OCRなら必ず再ダウンロード）
  if (existing?.result && existing?.etag)               headers['If-None-Match']     = existing.etag;
  else if (existing?.result && existing?.last_modified) headers['If-Modified-Since'] = existing.last_modified;

  try {
    // ダウンロードもタイムアウト必須（ハングしても必ず戻る）。
    // 官公庁サイトの数MB級 PDF が既定 45 秒に収まらず取りこぼす恐れがあるため、
    // ここだけ 90 秒に延ばす（無制限にはしない）。
    const res = await fetchWithTimeout(url, { headers }, 90_000);

    // 304 Not Modified → ファイル本体は取得不要
    if (res.status === 304 && existing?.content_sha256) {
      assetCache.touch(existing.content_sha256);
      console.log(`[DL] 304 Not Modified: ${url.split('/').pop()}`);
      return { buf: null, hash: existing.content_sha256, mime: existing.content_type || '', notModified: true };
    }

    if (!res.ok) { console.warn(`[DL] ${res.status}: ${url}`); return null; }

    const buf  = Buffer.from(await res.arrayBuffer());
    const hash = hashBuffer(buf);
    const mime = (res.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim();

    // レスポンスヘッダーをキャッシュに反映（次回の条件付きGET用）
    const meta = {
      asset_url:            url,
      normalized_asset_url: normUrl || url,
      content_type:         mime,
      content_length:       buf.length,
      etag:                 res.headers.get('etag')          || null,
      last_modified:        res.headers.get('last-modified') || null,
      last_checked_at:      new Date().toISOString(),
    };
    const cached = assetCache.getByHash(hash);
    if (cached) {
      assetCache.set(hash, { ...cached, ...meta });
    } else {
      assetCache.set(hash, meta);
    }

    return { buf, hash, mime, notModified: false };
  } catch (err) {
    console.warn(`[DL] ${url} → ${err.message}`);
    return null;
  }
}

// ── PDF テキスト直接抽出 ─────────────────────────────────────────
// 官公庁PDFはテキストレイヤーを持つことが多い。
// 十分なテキストが取れれば OCR API を呼ばずに済む。

let pdfParseLib = null;
function getPdfParse() {
  if (!pdfParseLib) {
    try { pdfParseLib = require('pdf-parse'); } catch { /* ライブラリ未インストール */ }
  }
  return pdfParseLib;
}

/**
 * PDF バッファから日本語テキストを抽出する。
 * pdf-parse v2（クラスAPI）と v1（関数API）の両方に対応する。
 * ※ v2 をv1の関数形式で呼ぶと常に例外→null となり、テキスト層のある
 *    官公庁PDFまで毎回 OCR API に流れてクォータを浪費するので注意。
 * @returns {string|null} 抽出テキスト（日本語文字が20字未満なら null）
 */
async function extractPdfText(buf) {
  const lib = getPdfParse();
  if (!lib) return null;
  try {
    let text = '';
    if (typeof lib.PDFParse === 'function') {
      // pdf-parse v2: クラスAPI
      const parser = new lib.PDFParse({ data: new Uint8Array(buf) });
      try {
        const result = await parser.getText({ first: 3 }); // 先頭3ページで十分
        text = (result.text || '').trim();
      } finally {
        await parser.destroy?.();
      }
    } else {
      // pdf-parse v1: 関数API
      const data = await lib(buf, { max: 3 });
      text = (data.text || '').trim();
    }
    const jpCount = (text.match(/[぀-鿿＀-￯]/g) || []).length;
    return jpCount >= 20 ? text : null;
  } catch {
    return null;
  }
}

/**
 * テキスト（pdf-parse / Tesseract 出力）からイベント情報を構造化抽出する。
 *
 * @param {string} text  - 抽出済みテキスト
 * @param {'full'|'pdf'} mode
 *   'full': チラシ全情報（date必須）
 *   'pdf':  PDF系（title/place/time のみ、date は HTML 側にある）
 * @returns {Object|null}
 */
function parseTextToEvent(text, mode = 'pdf') {
  const t = toHalfWidth(text.replace(/[ \t]+/g, ' ')).trim();
  if (!t) return null;

  // 日付（lib/ocrDate.js に集約。曜日カッコ無し・年なし・8/22 形式にも対応）
  // 以前はここが「YYYY年M月D日（曜）」必須で、ローカルOCRの行分割テキストを
  // ほぼ全て取りこぼしていた（構造化成功 0 件）。
  //
  // allowPast: 過去日の除外は従来どおり後段（parseOcrDate / isPast）で行う。
  // ここで null を返すと OCR 結果がキャッシュされず、終わったチラシを毎回
  // ダウンロードして OCR し直すことになる。
  const parsedDate = parseDateFromText(t, { allowPast: true });
  const dateStr    = parsedDate ? toJpDateString(parsedDate) : null;
  if (mode === 'full' && !dateStr) return null;

  // 時刻
  const timeM = t.match(/(\d{1,2}:\d{2}[～〜~]\d{1,2}:\d{2})/);

  // 場所（ラベル付き行を優先、なければ駐屯地・基地・会館などを検索）
  let place = null;
  const placeM = t.match(/(?:場所|会場|開催場所|実施場所)[：: ]\s*([^\n。、]{2,30})/);
  if (placeM) {
    place = placeM[1].trim();
  } else {
    const facilityM = t.match(/([^\s]{2,20}(?:駐屯地|基地|会館|市民会館|センター|ホール|大学|高校|区役所|庁舎|事務所|公園))/);
    if (facilityM) place = facilityM[1].trim();
  }

  // タイトル: 最初の「意味のある」日本語行（8字以上、日付行を除く）
  let title = null;
  for (const line of t.split(/\r?\n/)) {
    const l = line.trim();
    if (l.length < 6) continue;
    if (/令和|平成|^\d{4}年|^\d+月\d+日/.test(l)) continue; // 日付行スキップ
    if (/[぀-鿿]{4,}/.test(l)) {                     // 4字以上の日本語
      title = l.substring(0, 60);
      break;
    }
  }

  // 応募資格
  const ageM = t.match(/(?:対象|資格|応募資格|参加資格)[：: ]\s*([^\n。]{5,60})/);
  // 締切
  const deadM = t.match(/(?:応募締切|締切|申込締切)[：: ]\s*([^\n。]{3,30})/);
  // 備考
  const notesM = t.match(/(?:定員|注意事項|備考)[：: ]\s*([^\n。]{5,80})/);

  const result = {
    title:          title || null,
    date:           dateStr,
    place:          place || null,
    time:           timeM ? timeM[1] : null,
    ageRequirement: ageM  ? ageM[1].trim()  : null,
    deadline:       deadM ? deadM[1].trim() : null,
    notes:          notesM ? notesM[1].trim() : null,
  };

  // 有効なフィールドが1つもなければ null
  if (!result.title && !result.date && !result.place && !result.time) return null;
  return result;
}

// ── ローカル Tesseract OCR（画像用） ───────────────────────────
// node-tesseract-ocr ライブラリ（オプション依存。未インストール時はスキップ）
// GitHub Actions ubuntu-latest: tesseract-ocr-jpn を apt でインストール済みが前提

let tesseractLib = null;
let tesseractAvailable = null; // null=未チェック, true/false=チェック済み

function getTesseract() {
  if (!tesseractLib) {
    try { tesseractLib = require('node-tesseract-ocr'); } catch { /* 未インストール */ }
  }
  return tesseractLib;
}

async function checkTesseractAvailable() {
  if (tesseractAvailable !== null) return tesseractAvailable;
  const lib = getTesseract();
  if (!lib) {
    tesseractAvailable = false;
    console.warn('[OCRエンジン] Tesseract: node-tesseract-ocr が読み込めません → 無効');
    return false;
  }
  try {
    // 1x1ピクセルの白PNG（最小限のテスト）
    const tiny = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI6QAAAABJRU5ErkJggg==', 'base64');
    await lib.recognize(tiny, { lang: 'jpn', oem: 1, psm: 6 });
    tesseractAvailable = true;
    console.log('[OCRエンジン] Tesseract: 利用可能');
  } catch (err) {
    // 以前は握り潰していたため「apt で入れているのに一度も動いていない」ことに
    // 気付けなかった。理由まで出す（tesseract 未導入・jpn 言語データ欠落など）。
    tesseractAvailable = false;
    console.warn(`[OCRエンジン] Tesseract: 利用不可（${String(err && err.message).slice(0, 120)}）`);
  }
  return tesseractAvailable;
}

/**
 * Tesseract で画像バッファをOCRしてテキストを返す。
 * 日本語文字が10字未満の場合は信頼度が低いとみなし null を返す。
 */
async function tryTesseractOcr(buf) {
  if (!await checkTesseractAvailable()) return null;
  const lib = getTesseract();
  try {
    const text = await lib.recognize(buf, { lang: 'jpn', oem: 1, psm: 6 });
    const jpCount = (text.match(/[぀-鿿]/g) || []).length;
    if (jpCount >= 10) ocrStats.localText++;
    return jpCount >= 10 ? text : null;
  } catch {
    return null;
  }
}

// ── RapidOCR（ローカルONNX OCR。APIクレジット不要） ─────────────
// GitHub Actions では scraper/requirements-ocr.txt を pip install して使う。
// 未インストール・失敗時は静かにスキップし、後続OCRへフォールバックする。

const RAPID_OCR_SCRIPT = path.join(__dirname, 'lib', 'rapidocr_cli.py');
let rapidOcrAvailable = null;
let rapidOcrPython = null;

async function checkRapidOcrAvailable() {
  if (process.env.RAPIDOCR_DISABLED === '1') return false;
  if (rapidOcrAvailable !== null) return rapidOcrAvailable;

  const candidates = [
    process.env.PYTHON,
    process.platform === 'win32' ? 'python' : 'python3',
    'python',
  ].filter(Boolean);

  for (const cmd of candidates) {
    try {
      await execFileAsync(cmd, [RAPID_OCR_SCRIPT, '--check'], { timeout: 15_000, maxBuffer: 1024 * 1024 });
      rapidOcrPython = cmd;
      rapidOcrAvailable = true;
      console.log(`[OCRエンジン] RapidOCR: 利用可能（${cmd}）`);
      return true;
    } catch { /* try next python command */ }
  }

  rapidOcrAvailable = false;
  console.warn('[OCRエンジン] RapidOCR: 利用不可（python / rapidocr-onnxruntime 未導入）');
  return false;
}

/**
 * RapidOCRで画像バッファをOCRしてテキストを返す。
 * 日本語文字が10字未満の場合は信頼度が低いとみなし null を返す。
 */
async function tryRapidOcr(buf, label = 'RapidOCR') {
  if (!await checkRapidOcrAvailable()) return null;
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'jsdf-rapidocr-'));
  const imgPath = path.join(tmpDir, 'input.jpg');
  try {
    await fsp.writeFile(imgPath, buf);
    const { stdout } = await execFileAsync(
      rapidOcrPython,
      [RAPID_OCR_SCRIPT, imgPath],
      { timeout: 75_000, maxBuffer: 2 * 1024 * 1024 }
    );
    const json = JSON.parse(stdout);
    const text = (json.text || '').trim();
    const jpCount = (text.match(/[぀-鿿]/g) || []).length;
    if (jpCount >= 10) {
      ocrStats.localText++;
      console.log(`[${label}] RapidOCR 成功`);
      return text;
    }
    return null;
  } catch (err) {
    // rapidocr_cli.py は例外時に {"ok":false,"error":...} を stdout に出して exit 1 する。
    // execFile の err.message は「Command failed」だけで原因が分からないため詳細を拾う
    let detail = err.message;
    const out = `${err.stdout || ''}`.trim();
    const errOut = `${err.stderr || ''}`.trim();
    if (out) {
      try { detail = JSON.parse(out).error || detail; } catch { detail = out.slice(0, 200); }
    } else if (errOut) {
      detail = errOut.slice(0, 200);
    }
    console.warn(`[${label}] RapidOCR エラー: ${detail}`);
    return null;
  } finally {
    fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ── OCR前の画像正規化（巨大画像のリサイズ・再エンコード） ─────────
// Groq は 33,177,600px 超の画像を 400、巨大ファイルを 413 で拒否し、
// 巨大画像はローカル OCR（Tesseract/RapidOCR）のタイムアウト・メモリ失敗も招く。
// API へ流す前にローカルで縮小し、無駄なフォールバックとクォータ消費を防ぐ。
// sharp が使えない環境では素通し（従来動作）。
const OCR_MAX_PIXELS = Number.parseInt(process.env.OCR_MAX_PIXELS || '20000000', 10);  // 2,000万px
const OCR_MAX_BYTES  = Number.parseInt(process.env.OCR_MAX_BYTES  || '3000000', 10);   // 3MB（base64で約4MB）

let sharpModule; // 遅延ロード。未インストールなら null
function getSharp() {
  if (sharpModule === undefined) {
    try { sharpModule = require('sharp'); } catch { sharpModule = null; }
  }
  return sharpModule;
}

/**
 * OCR に送る画像バッファを正規化する。
 * - 画素数・バイト数が上限を超える場合は縮小して JPEG に再エンコード
 * - CMYK など OCR API が拒否しやすい色空間も sRGB JPEG に変換
 * - デコード不能（画像を装った HTML エラーページ等）は ok:false を返し、
 *   呼び出し側は API 送信をスキップする（400 での失敗が確定しているため）
 * @returns {{buf: Buffer, mime: string, ok: boolean}}
 */
async function prepareImageForOcr(buf, mime, label = 'OCR') {
  const sharp = getSharp();
  if (!sharp) return { buf, mime, ok: true };
  try {
    const meta = await sharp(buf, { limitInputPixels: false }).metadata();
    const pixels = (meta.width || 0) * (meta.height || 0);
    if (!pixels) return { buf, mime, ok: true };
    const needsRework = pixels > OCR_MAX_PIXELS
      || buf.length > OCR_MAX_BYTES
      || /cmyk/i.test(meta.space || '');
    if (!needsRework) return { buf, mime, ok: true };

    const scale = Math.min(1, Math.sqrt(OCR_MAX_PIXELS / pixels));
    const width = Math.max(1, Math.floor((meta.width || 1) * scale));
    let out = await sharp(buf, { limitInputPixels: false })
      .rotate() // EXIF の回転を反映（回転情報は JPEG 再エンコードで失われるため）
      .resize({ width, withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    if (out.length > OCR_MAX_BYTES) {
      out = await sharp(out).jpeg({ quality: 60 }).toBuffer();
    }
    console.log(`[${label}] 巨大画像を縮小: ${meta.width}x${meta.height}/${buf.length}B → 幅${width}px/${out.length}B`);
    return { buf: out, mime: 'image/jpeg', ok: true };
  } catch (err) {
    console.warn(`[${label}] 画像デコード失敗（API送信をスキップ）: ${err.message}`);
    return { buf, mime, ok: false };
  }
}

// ── OCR.space（無料APIフォールバック） ─────────────────────────
// Free plan: 25,000 req/month, 500 req/day/IP, 1MB/file, PDF 3 pages.
// 既存のassetCacheにより同一ファイルは二度OCRしない。

let ocrSpaceQuotaExhausted = false;

let ocrSpaceKeyWarned = false;

async function callOcrSpaceText(base64, mimeType, label = 'OCR.space') {
  if (!process.env.OCR_SPACE_API_KEY) {
    // キー未登録だとこの段は丸ごと死にコードになる。無言だと気付けないので1回だけ出す
    if (!ocrSpaceKeyWarned) {
      ocrSpaceKeyWarned = true;
      console.warn('[OCRエンジン] OCR.space: OCR_SPACE_API_KEY 未設定 → この段は常にスキップされます');
    }
    return null;
  }
  if (ocrSpaceQuotaExhausted) {
    console.warn(`[${label}] OCR.space クォータ枯渇フラグ → スキップ`);
    return null;
  }

  const maxBytes = Number.parseInt(process.env.OCR_SPACE_MAX_BYTES || '900000', 10);
  const approxBytes = Math.floor(base64.length * 3 / 4);
  if (Number.isFinite(maxBytes) && approxBytes > maxBytes) {
    console.log(`[${label}] OCR.space free limit回避: ${approxBytes} bytes`);
    return null;
  }

  const form = new FormData();
  form.append('apikey', process.env.OCR_SPACE_API_KEY);
  form.append('base64Image', `data:${mimeType};base64,${base64}`);
  form.append('language', process.env.OCR_SPACE_LANGUAGE || 'jpn');
  form.append('OCREngine', process.env.OCR_SPACE_ENGINE || '1');
  form.append('isOverlayRequired', 'false');
  form.append('scale', 'true');
  if (mimeType === 'application/pdf') form.append('filetype', 'PDF');

  try {
    const res = await fetchWithTimeout('https://api.ocr.space/parse/image', { method: 'POST', body: form }, 90_000);
    if (!res.ok) {
      if (res.status === 429 || res.status === 403) ocrSpaceQuotaExhausted = true;
      console.warn(`[${label}] OCR.space HTTP ${res.status}`);
      return null;
    }

    const json = await res.json();
    const errors = [
      ...(Array.isArray(json.ErrorMessage) ? json.ErrorMessage : json.ErrorMessage ? [json.ErrorMessage] : []),
      ...(Array.isArray(json.ErrorDetails) ? json.ErrorDetails : json.ErrorDetails ? [json.ErrorDetails] : []),
    ].join(' ');
    if (json.IsErroredOnProcessing || errors) {
      if (/quota|limit|maximum|daily|monthly/i.test(errors)) ocrSpaceQuotaExhausted = true;
      console.warn(`[${label}] OCR.space エラー: ${errors.slice(0, 140)}`);
      return null;
    }

    const text = (json.ParsedResults || []).map(r => r.ParsedText || '').filter(Boolean).join('\n\n').trim();
    if (!text) return null;
    console.log(`[${label}] OCR.space 成功`);
    return text;
  } catch (err) {
    console.warn(`[${label}] OCR.space エラー: ${err.message}`);
    return null;
  }
}

async function hasAnyOcrEngine() {
  if (process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY || process.env.MISTRAL_API_KEY || process.env.OCR_SPACE_API_KEY) {
    return true;
  }
  return await checkTesseractAvailable() || await checkRapidOcrAvailable();
}

// ── OCR 稼働統計（ワークフローの健全性チェックが読む） ─────────────
// 2026-07-17 の Groq llama-4-scout 廃止、2026-08-11 の Gemini 2.0 Flash 廃止は
// いずれも「総イベント数」には即座に現れず（キャッシュが穴を埋めるため）、
// 1か月以上気付けなかった。OCR 層そのものの成否を数えて外に出す。
const ocrStats = {
  attempted:  0,  // OCR を試行したアセット数（キャッシュヒットを除く）
  cacheHits:  0,  // 既存 OCR 結果を再利用した数
  localText:  0,  // Tesseract/RapidOCR で生テキストが取れた数
  structured: 0,  // 構造化イベントとして成立した数（これが 0 なら OCR は死んでいる）
  engine:     { pdftext: 0, tesseract: 0, rapidocr: 0, groq: 0, ocrspace: 0, mistral: 0, gemini: 0 },
  errors:     { groq: 0, ocrspace: 0, mistral: 0, gemini: 0 },
  models:     {},  // 実際に使ったモデルID（廃止追従の記録）
};

/** OCR 成功をエンジン別に記録する */
function noteOcrSuccess(engine) {
  ocrStats.structured++;
  if (engine in ocrStats.engine) ocrStats.engine[engine]++;
}

/**
 * 抽出テキストを構造化し、成功したらどのエンジンが効いたかを記録する。
 * parseTextToEvent を直接呼ぶと「どの段で取れたか」が統計に残らない。
 */
function structureOcrText(text, mode, engine) {
  const result = parseTextToEvent(text, mode);
  if (result) noteOcrSuccess(engine);
  return result;
}

const OCR_STATS_PATH = path.join(__dirname, 'ocr-stats.json');

/** OCR 稼働統計を scraper/ocr-stats.json に書き出し、サマリを標準出力にも出す */
function writeOcrStats() {
  const cloudErrors = Object.values(ocrStats.errors).reduce((a, b) => a + b, 0);
  const summary = {
    ...ocrStats,
    cloudErrors,
    generatedAt: new Date().toISOString(),
  };
  try {
    fs.writeFileSync(OCR_STATS_PATH, JSON.stringify(summary, null, 2), 'utf8');
  } catch (err) {
    console.warn(`[OCR統計] 書き出し失敗: ${err.message}`);
  }
  console.log('[OCR統計]'
    + ` 試行 ${ocrStats.attempted} 件 / キャッシュ再利用 ${ocrStats.cacheHits} 件`
    + ` / ローカル生テキスト ${ocrStats.localText} 件 / 構造化成功 ${ocrStats.structured} 件`
    + ` / クラウド失敗 ${cloudErrors} 件`);
  console.log(`  エンジン別成功: ${Object.entries(ocrStats.engine).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  console.log(`  使用モデル: ${Object.entries(ocrStats.models).map(([k, v]) => `${k}=${v}`).join(' ') || '(未使用)'}`);
}

// ── OCR モデルIDの解決（プロバイダ側の廃止に自動追従） ────────────
// 固定IDを1つだけ持つ設計だと、モデルが廃止された瞬間に 404 を吐き続けて
// OCR が全滅する（実際に Groq・Gemini の両方で起きた）。候補リストを持ち、
// プロバイダの models API に実在するものを実行時に選ぶ。
//   - env（GROQ_OCR_MODEL / GEMINI_OCR_MODEL）が最優先
//   - models API が引けない場合は候補の先頭を使う（従来どおりの挙動）
//   - 呼び出しが 404（モデル無し）を返したらそのIDを外して再解決する

// 候補は 2026-08-18 に各プロバイダの公式ドキュメントで実在を確認したもの。
// リストが古くなっても discover（lib/ocrModel.js）が一覧から選び直すので、
// ここが陳腐化しただけで OCR が止まることはない。
const GROQ_VISION_MODEL_CANDIDATES = [
  process.env.GROQ_OCR_MODEL,
  // console.groq.com/docs/vision が挙げる唯一の画像入力モデル
  // （20MB/枚・5枚まで・JSONモード対応）
  'qwen/qwen3.6-27b',
].filter(Boolean);

const GEMINI_MODEL_CANDIDATES = [
  process.env.GEMINI_OCR_MODEL,
  'gemini-3.5-flash-lite',               // 最安・最速。抽出用途の推奨モデル
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.6-flash',
  'gemini-3.7-flash',
].filter(Boolean);

const MISTRAL_OCR_MODEL = process.env.MISTRAL_OCR_MODEL || 'mistral-ocr-latest';

/** Groq の利用可能モデルID一覧を取得する（失敗時は null） */
async function listGroqModels() {
  try {
    const res = await fetchWithTimeout('https://api.groq.com/openai/v1/models', {
      headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
    }, 15_000);
    if (!res.ok) return null;
    const json = await res.json();
    return (json.data || []).filter(m => m.active !== false).map(m => m.id);
  } catch { return null; }
}

/** Gemini の利用可能モデルID一覧を取得する（generateContent 対応のみ。失敗時は null） */
async function listGeminiModels() {
  try {
    const res = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}&pageSize=200`,
      {}, 15_000);
    if (!res.ok) return null;
    const json = await res.json();
    return (json.models || [])
      .filter(m => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent'))
      .map(m => String(m.name || '').replace(/^models\//, ''));
  } catch { return null; }
}

// 解決ロジック本体は lib/ocrModel.js（ユニットテスト: shared/ocrModel.test.cjs）
const groqModelResolver = new OcrModelResolver({
  provider: 'groq', candidates: GROQ_VISION_MODEL_CANDIDATES, listModels: listGroqModels,
  discover: discoverGroqModel,
});
const geminiModelResolver = new OcrModelResolver({
  provider: 'gemini', candidates: GEMINI_MODEL_CANDIDATES, listModels: listGeminiModels,
  discover: discoverGeminiModel,
});

/** 解決結果を統計にも残す（廃止追従の記録） */
async function resolveOcrModel(provider, resolver) {
  const id = await resolver.resolve();
  ocrStats.models[provider] = id || 'none';
  return id;
}

const resolveGroqModel   = () => resolveOcrModel('groq',   groqModelResolver);
const resolveGeminiModel = () => resolveOcrModel('gemini', geminiModelResolver);

/** 404（モデル廃止）を受けたモデルIDを候補から外し、次回の再解決を促す */
function markModelDead(provider, modelId) {
  (provider === 'groq' ? groqModelResolver : geminiModelResolver).markDead(modelId);
}

// ── Groq OCR（画像専用: 栃木・富山・兵庫・滋賀・奈良 など） ────────
// ※ Groq は PDF 非対応 → PDF は引き続き Gemini を使用
// 旧 meta-llama/llama-4-scout-17b-16e-instruct は 2026-07-17 に廃止された。
// モデルIDは resolveGroqModel() が実行時に決める（上記「OCRモデルIDの解決」参照）。

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
  const model = await resolveGroqModel();
  if (!model) {
    console.warn(`[${label}] Groq: 利用可能なモデルがありません → スキップ`);
    return null;
  }
  const retryDelays = [30_000];
  for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
    let apiRes;
    try {
      apiRes = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        model,
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
    } catch (err) {
      ocrStats.errors.groq++;
      console.warn(`[${label}] Groq 通信エラー: ${err.message}`);
      return null;
    }
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
      ocrStats.errors.groq++;
      console.warn(`[${label}] Groq エラー (${apiRes.status}): ${errText.slice(0, 120)}`);
      // モデル廃止（404 / decommissioned）は候補を切り替えて 1 度だけやり直す
      if (isModelGoneError(apiRes.status, errText)) {
        markModelDead('groq', model);
        const next = await resolveGroqModel();
        if (next && next !== model) return callGroqOcr(base64, mimeType, prompt, label);
      }
      return null;
    }
    const apiJson   = await apiRes.json();
    const text      = apiJson.choices?.[0]?.message?.content ?? '';
    const jsonMatch = text.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
    if (!jsonMatch) {
      console.warn(`[${label}] Groq JSON パース失敗: ${text.slice(0, 100)}`);
      return null;
    }
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed) noteOcrSuccess('groq');
      return parsed;
    } catch { return null; }
  }
  return null;
}

// ── PDF → 画像変換（poppler-utils / pdftoppm） ─────────────────────
// PDFをJPEG画像配列に変換することで、Groq VisionなどのOCRに渡せるようにする。
// pdftoppm は GitHub Actions Ubuntu に apt でインストール済みが前提。

let pdftoppmAvailable = null;

async function checkPdftoppm() {
  if (pdftoppmAvailable !== null) return pdftoppmAvailable;
  try {
    await execFileAsync('pdftoppm', ['-v'], { timeout: 5000 });
    pdftoppmAvailable = true;
  } catch {
    pdftoppmAvailable = false;
  }
  return pdftoppmAvailable;
}

/**
 * PDFバッファを JPEG 画像バッファの配列に変換する（先頭 maxPages ページ）。
 * pdftoppm（poppler-utils）が必要。利用不可なら空配列を返す。
 */
async function pdfToImages(pdfBuf, maxPages = 2) {
  if (!await checkPdftoppm()) return [];
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'jsdf-pdf-'));
  const pdfPath = path.join(tmpDir, 'input.pdf');
  try {
    await fsp.writeFile(pdfPath, pdfBuf);
    await execFileAsync('pdftoppm', [
      '-jpeg', '-r', '150', '-l', String(maxPages),
      pdfPath, path.join(tmpDir, 'page'),
    ], { timeout: 30_000 });
    const files = (await fsp.readdir(tmpDir))
      .filter(f => /\.(jpg|jpeg)$/i.test(f))
      .sort()
      .slice(0, maxPages);
    const bufs = await Promise.all(files.map(f => fsp.readFile(path.join(tmpDir, f))));
    // 大判ポスターPDF は 150dpi でも 3,000万px 超になり OCR API に拒否されるため縮小する
    const prepped = [];
    for (const b of bufs) prepped.push((await prepareImageForOcr(b, 'image/jpeg', 'PDF2IMG')).buf);
    return prepped;
  } catch (err) {
    console.warn('[PDF2IMG]', err.message);
    return [];
  } finally {
    fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ── Mistral OCR（PDFネイティブサポート） ──────────────────────────
// Mistral AI OCR API: PDF を直接 OCR してマークダウンで返す。
// 無料枠あり（新規アカウント時のクレジット）。
// 必要環境変数: MISTRAL_API_KEY

let mistralQuotaExhausted = false;

/**
 * Mistral OCR API で PDF/画像をOCRしてイベント情報JSONを返す。
 * API が返したマークダウン全文を parseTextToEvent() で構造化する。
 * @param {string} base64 - ファイルのbase64
 * @param {'application/pdf'|string} mimeType
 * @param {string} label
 */
async function callMistralOcr(base64, mimeType, label = 'Mistral-OCR') {
  if (!process.env.MISTRAL_API_KEY) return null;
  if (mistralQuotaExhausted) {
    console.warn(`[${label}] Mistral クォータ枯渇 → スキップ`);
    return null;
  }
  try {
    const isPdf   = mimeType === 'application/pdf';
    const dataUri = `data:${mimeType};base64,${base64}`;
    const body    = {
      model: MISTRAL_OCR_MODEL,
      document: isPdf
        ? { type: 'document_url', document_url: dataUri }
        : { type: 'image_url',    image_url:    dataUri },
    };
    const res = await fetchWithTimeout('https://api.mistral.ai/v1/ocr', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(body),
    }, 90_000);
    if (!res.ok) {
      if (res.status === 429 || res.status === 402) {
        console.warn(`[${label}] Mistral ${res.status} → クォータ枯渇フラグ`);
        mistralQuotaExhausted = true;
        return null;
      }
      // 400 はステータスだけでは原因が分からずデバッグできなかったため本文も出す
      // （対応形式は PNG / JPEG / AVIF / PDF / PPTX / DOCX。それ以外は 400 になる）
      const errText = await res.text().catch(() => '');
      ocrStats.errors.mistral++;
      console.warn(`[${label}] Mistral エラー: ${res.status} ${errText.slice(0, 160)}`);
      return null;
    }
    const json = await res.json();
    const text = (json.pages || []).map(p => p.markdown || '').filter(Boolean).join('\n\n');
    if (!text.trim()) return null;
    const result = parseTextToEvent(text, 'full');
    if (result) { noteOcrSuccess('mistral'); console.log(`[${label}] Mistral OCR 成功`); }
    return result;
  } catch (err) {
    ocrStats.errors.mistral++;
    console.warn(`[${label}] Mistral エラー: ${err.message}`);
    return null;
  }
}

// ── Gemini OCR（PDF専用: 岩手・青森・三重・和歌山 など） ───────────
// Gemini は PDF をネイティブサポート。Groq はPDF非対応のため PDF のみ引き続き使用。
// 無料枠: 1,500 RPD / 15 RPM

let geminiQuotaExhausted = false;

/** OCR結果フィールドを安全に文字列化してtrimする（非文字列・nullも許容） */
function safeStr(v) {
  if (!v) return '';
  if (typeof v === 'string') {
    const t = v.trim();
    // OCR/LLM が JSON の null を文字列 "null"/"undefined" として返すことがある → 空扱い
    if (/^(null|undefined)$/i.test(t)) return '';
    return t;
  }
  if (Array.isArray(v)) return v.map(safeStr).filter(Boolean).join(' ').trim();
  return String(v).trim();
}

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
  const model = await resolveGeminiModel();
  if (!model) {
    console.warn(`[${label}] Gemini: 利用可能なモデルがありません → スキップ`);
    return null;
  }
  const retryDelays = [60_000];
  for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
    let apiRes;
    try {
      apiRes = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method:  'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { maxOutputTokens: 512, temperature: 0 },
          }),
        }
      );
    } catch (err) {
      ocrStats.errors.gemini++;
      console.warn(`[${label}] Gemini 通信エラー: ${err.message}`);
      return null;
    }
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
      ocrStats.errors.gemini++;
      console.warn(`[${label}] Gemini エラー (${apiRes.status}): ${errText.slice(0, 100)}`);
      // モデル廃止（404 / no longer available）は候補を切り替えて 1 度だけやり直す
      if (isModelGoneError(apiRes.status, errText)) {
        markModelDead('gemini', model);
        const next = await resolveGeminiModel();
        if (next && next !== model) return callGeminiOcr(parts, label);
      }
      return null;
    }
    const apiJson   = await apiRes.json();
    const text      = apiJson.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const jsonMatch = text.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
    if (!jsonMatch) return null;
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed) noteOcrSuccess('gemini');
      return parsed;
    } catch { return null; }
  }
  return null;
}

// ── OCR 共通ルール（全プロンプトの title / deadline 定義に埋め込む） ──
// 2026-07-02 の全件監査で OCR 由来の不良タイトル（部隊名のみ・受付時刻・装備スペック・
// 調達文書等）が多数見つかったため、抽出段階でも抑止する（最終防御は titleQuality）。
const OCR_TITLE_RULE = 'に書かれた正確なイベント名。'
  + '部隊名・学校名・組織名だけを返さない（例:「海上自衛隊」「防衛医科大学校」は不可。種別まで含めて「防衛医科大学校 説明会」のように）。'
  + '受付時間・装備の性能諸元・住所・電話番号・「詳細はこちら」等の案内文・入札/契約などの調達文書の件名はイベント名ではない。'
  + 'イベント名が読み取れない場合はnull';
const OCR_DEADLINE_RULE = '応募締切日（例: 4月24日（金））。'
  + '「定員に達し次第締切」等の条件文のみで具体的な日付がない場合はnull';

const OCR_PROMPT = `この自衛隊イベントのポスター画像から情報を抽出してください。
以下のJSONのみを返してください（説明文不要）。該当情報がない項目はnullにしてください。
{
  "title": "ポスター${OCR_TITLE_RULE}",
  "place": "開催場所・会場名（施設名のみ、住所不要）",
  "time": "開催時間（例: 10:00～16:00）",
  "ageRequirement": "参加資格・対象者を簡潔に（例: 中学生以上33歳未満、日本国籍を有する方）",
  "deadline": "${OCR_DEADLINE_RULE}",
  "notes": "定員・抽選有無・注意事項など重要事項のみ50文字以内で簡潔に",
  "url": "画像内のQRコードが指すURL（QRコードがなければnull）"
}`;

/**
 * ポスター画像URLを受け取り OCR して JSON を返す（ハッシュキャッシュ対応）。
 * パイプライン: Tesseract（ローカル）→ RapidOCR（ローカル）→ Groq → OCR.space → Gemini
 */
async function ocrImage(imageUrl) {
  if (!imageUrl) return null;
  if (!await hasAnyOcrEngine()) return null;

  const dl = await downloadFile(imageUrl);
  if (!dl) return null;

  // ハッシュベースキャッシュ確認
  if (assetCache.getByHash(dl.hash) && assetCache.getByHash(dl.hash).result) {
    ocrStats.cacheHits++;
    console.log(`[OCR] キャッシュヒット: ${imageUrl.split('/').pop()}`);
    return assetCache.getByHash(dl.hash).result;
  }

  const prep = await prepareImageForOcr(dl.buf, dl.mime, 'OCR');
  const base64 = prep.buf.toString('base64');
  ocrStats.attempted++;   // キャッシュミス → 実際にOCRを走らせる
  let result = null;

  // 1. ローカル Tesseract
  const tessText = await tryTesseractOcr(prep.buf);
  if (tessText) {
    result = structureOcrText(tessText, 'full', 'tesseract');
    if (result) console.log(`[OCR] Tesseract 成功: ${imageUrl.split('/').pop()}`);
  }

  // 2. RapidOCR
  if (!result) {
    const rapidText = await tryRapidOcr(prep.buf, 'OCR');
    if (rapidText) {
      result = structureOcrText(rapidText, 'full', 'rapidocr');
      if (result) console.log(`[OCR] RapidOCR 構造化成功: ${imageUrl.split('/').pop()}`);
    }
  }

  // 3. Groq Vision
  if (!result && prep.ok && process.env.GROQ_API_KEY) {
    result = await callGroqOcr(base64, prep.mime, OCR_PROMPT, 'OCR');
  }
  // 4. OCR.space
  if (!result && prep.ok && process.env.OCR_SPACE_API_KEY) {
    const ocrSpaceText = await callOcrSpaceText(base64, prep.mime, 'OCR');
    if (ocrSpaceText) result = structureOcrText(ocrSpaceText, 'full', 'ocrspace');
  }
  // 5. Gemini Flash
  if (!result && prep.ok && process.env.GEMINI_API_KEY) {
    result = await callGeminiOcr([
      { inline_data: { mime_type: prep.mime, data: base64 } },
      { text: OCR_PROMPT },
    ], 'OCR');
  }
  if (result) assetCache.set(dl.hash, { ocr_status: "success", last_ocr_at: new Date().toISOString(), url: imageUrl, result });
  return result;
}

/**
 * OCR で生じやすい誤認識を修正する。
 * 醍 → 第（画数が近く混同されやすい）
 */
function fixOcrTitle(title) {
  if (!title) return title;
  // OCR誤認識を修正
  title = title.replace(/醍/g, '第');
  // 先頭・末尾のゴミ（Markdown記号・装飾・新着マーク等）を整形
  title = cleanEventTitle(title);

  // 非イベントテキストはタイトルにしない（null を返し呼び出し側でフォールバック）
  if (isJunkOrStubTitle(title)) return null;

  return title;
}

// ── PDF OCR（PDF 系地本の標準パターン） ────────────────────────
// PDF 運営地本（岩手・青森など）に使用。ev.url が .pdf のイベントを対象にする。

const PDF_OCR_PROMPT = `この自衛隊イベントのPDFから情報を抽出してください。
以下のJSONのみを返してください（説明文不要）。該当情報がない項目はnullにしてください。
{
  "title": "PDF${OCR_TITLE_RULE}",
  "place": "開催場所・会場名（施設名・住所など）",
  "time": "開催時間（例: 10:00～16:00）",
  "ageRequirement": "参加資格・対象者を簡潔に（例: 18歳〜32歳未満、日本国籍を有する方）",
  "deadline": "${OCR_DEADLINE_RULE}",
  "notes": "定員・抽選有無・注意事項など重要事項のみ50文字以内で簡潔に"
}`;

/**
 * PDF URL を受け取り OCR して JSON を返す（ハッシュキャッシュ対応）。
 * パイプライン:
 *   1. PDFテキスト直接抽出（テキストレイヤー）
 *   2. PDF→画像変換 → Tesseract（ローカル）
 *   3. PDF→画像変換 → RapidOCR（ローカル）
 *   4. PDF→画像変換 → Groq Vision（無料・高レート）
 *   5. OCR.space（無料API、1MB/3ページ制限内のみ）
 *   6. Mistral OCR（PDFネイティブ）
 *   7. Gemini Flash（フォールバック）
 */
async function ocrPdf(pdfUrl) {
  if (!pdfUrl) return null;

  const dl = await downloadFile(pdfUrl);
  if (!dl) return null;

  // ハッシュベースキャッシュ確認
  if (assetCache.getByHash(dl.hash) && assetCache.getByHash(dl.hash).result) {
    ocrStats.cacheHits++;
    console.log(`[PDF-OCR] キャッシュヒット: ${pdfUrl.split('/').pop()}`);
    return assetCache.getByHash(dl.hash).result;
  }

  if (dl.notModified) return null;

  const base64 = dl.buf.toString('base64');
  ocrStats.attempted++;   // キャッシュミス → 実際にOCRを走らせる
  let result = null;

  // 1. PDFテキスト直接抽出
  const pdfText = await extractPdfText(dl.buf);
  if (pdfText) {
    result = structureOcrText(pdfText, 'pdf', 'pdftext');
    if (result) console.log(`[PDF-OCR] テキスト抽出成功（API不要）: ${pdfUrl.split('/').pop()}`);
  }

  // 2. PDF→画像 → Tesseract
  if (!result) {
    const imgs = await pdfToImages(dl.buf, 2);
    for (const imgBuf of imgs) {
      const tessText = await tryTesseractOcr(imgBuf);
      if (tessText) { result = structureOcrText(tessText, 'full', 'tesseract'); }
      if (result) { console.log(`[PDF-OCR] Tesseract 成功: ${pdfUrl.split('/').pop()}`); break; }
    }
  }

  // 3. PDF→画像 → RapidOCR
  if (!result) {
    const imgs = await pdfToImages(dl.buf, 2);
    for (const imgBuf of imgs) {
      const rapidText = await tryRapidOcr(imgBuf, 'PDF-OCR');
      if (rapidText) result = structureOcrText(rapidText, 'pdf', 'rapidocr');
      if (result) { console.log(`[PDF-OCR] RapidOCR 成功: ${pdfUrl.split('/').pop()}`); break; }
    }
  }

  // 4. PDF→画像 → Groq Vision
  if (!result && process.env.GROQ_API_KEY) {
    const imgs = await pdfToImages(dl.buf, 2);
    for (const imgBuf of imgs) {
      const imgBase64 = imgBuf.toString('base64');
      result = await callGroqOcr(imgBase64, 'image/jpeg', PDF_OCR_PROMPT, 'PDF-OCR(Groq)');
      if (result) { console.log(`[PDF-OCR] Groq Vision 成功: ${pdfUrl.split('/').pop()}`); break; }
    }
  }

  // 5. OCR.space（PDFネイティブ）
  if (!result && process.env.OCR_SPACE_API_KEY) {
    const ocrSpaceText = await callOcrSpaceText(base64, 'application/pdf', 'PDF-OCR(OCR.space)');
    if (ocrSpaceText) result = structureOcrText(ocrSpaceText, 'pdf', 'ocrspace');
  }

  // 6. Mistral OCR（PDFネイティブ）
  if (!result) {
    result = await callMistralOcr(base64, 'application/pdf', 'PDF-OCR(Mistral)');
  }

  // 7. Gemini Flash（フォールバック）
  if (!result && process.env.GEMINI_API_KEY) {
    result = await callGeminiOcr([
      { inline_data: { mime_type: 'application/pdf', data: base64 } },
      { text: PDF_OCR_PROMPT },
    ], 'PDF-OCR(Gemini)');
  }

  if (result) assetCache.set(dl.hash, { ocr_status: 'success', last_ocr_at: new Date().toISOString(), url: pdfUrl, result });
  return result;
}

/**
 * ev.url が .pdf で終わるイベントに対して PDF OCR を実行し
 * タイトル・場所・時間等を補完して返す。
 *
 * PDF 運営地本（岩手・青森など）の標準 OCR パターン。
 * 新たに PDF 系地本を追加する際はこの関数を main() から呼ぶこと。
 */
async function enrichWithPdfOcr(events) {
  if (!await hasAnyOcrEngine()) {
    console.log('[PDF-OCR] 利用可能なOCRエンジンがないためスキップ');
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

    // OCRでタイトルが取れればそれを採用。取れなければ元タイトルを維持し、
    // 中身なしスタブ（「自衛隊○○地本イベント」等）は writeOutput の最終フィルタで除外する。
    results.push(ocr ? {
      ...ev,
      title:          (ocr.title          && fixOcrTitle(safeStr(ocr.title)))  || ev.title,
      place:          (safeStr(ocr.place))               || ev.place || '',
      time:           safeStr(ocr.time)                || ev.time  || '',
      ageRequirement: safeStr(ocr.ageRequirement)      || ev.ageRequirement || null,
      deadline:       safeStr(ocr.deadline)            || ev.deadline       || null,
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
  "title": "チラシ${OCR_TITLE_RULE}",
  "date": "開催日（「令和X年Y月Z日（曜日）」の形式で。例: 令和8年6月15日（日））",
  "place": "開催場所・会場名（施設名のみ、住所不要）",
  "time": "開催時間（例: 10:00～16:00）",
  "ageRequirement": "参加資格・対象者を簡潔に（例: 18歳〜32歳未満）",
  "deadline": "${OCR_DEADLINE_RULE}",
  "notes": "定員・抽選有無・注意事項など重要事項のみ50文字以内"
}`;

/**
 * PDF または画像 URL を受け取り、全情報（date 含む）を OCR して JSON を返す。
 * ハッシュキャッシュ対応。
 * パイプライン:
 *   PDF  → テキスト抽出 → PDF→画像(Tesseract) → PDF→画像(RapidOCR) → PDF→画像(Groq) → OCR.space → Mistral → Gemini
 *   画像 → Tesseract → RapidOCR → Groq → OCR.space → Mistral → Gemini
 */
async function ocrFlyerFull(url) {
  if (!url) return null;
  const isPdf = /\.pdf(\?.*)?$/i.test(url);

  const dl = await downloadFile(url);
  if (!dl) return null;

  // ハッシュベースキャッシュ確認
  if (assetCache.getByHash(dl.hash) && assetCache.getByHash(dl.hash).result) {
    ocrStats.cacheHits++;
    console.log(`[チラシOCR] キャッシュヒット: ${url.split('/').pop()}`);
    return assetCache.getByHash(dl.hash).result;
  }

  if (dl.notModified) return null;

  const base64 = dl.buf.toString('base64');
  ocrStats.attempted++;   // キャッシュミス → 実際にOCRを走らせる
  let result = null;

  if (isPdf) {
    // 1. PDFテキスト直接抽出
    const pdfText = await extractPdfText(dl.buf);
    if (pdfText) {
      result = structureOcrText(pdfText, 'full', 'pdftext');
      if (result) console.log(`[チラシOCR] PDFテキスト抽出成功（API不要）: ${url.split('/').pop()}`);
    }
    // 2. PDF→画像 → Tesseract
    if (!result) {
      const imgs = await pdfToImages(dl.buf, 2);
      for (const imgBuf of imgs) {
        const t = await tryTesseractOcr(imgBuf);
        if (t) { result = structureOcrText(t, 'full', 'tesseract'); }
        if (result) { console.log(`[チラシOCR] PDF+Tesseract 成功`); break; }
      }
    }
    // 3. PDF→画像 → RapidOCR
    if (!result) {
      const imgs = await pdfToImages(dl.buf, 2);
      for (const imgBuf of imgs) {
        const rapidText = await tryRapidOcr(imgBuf, 'チラシOCR-PDF');
        if (rapidText) result = structureOcrText(rapidText, 'full', 'rapidocr');
        if (result) { console.log(`[チラシOCR] PDF+RapidOCR 成功`); break; }
      }
    }
    // 4. PDF→画像 → Groq Vision
    if (!result && process.env.GROQ_API_KEY) {
      const imgs = await pdfToImages(dl.buf, 2);
      for (const imgBuf of imgs) {
        result = await callGroqOcr(imgBuf.toString('base64'), 'image/jpeg', FLYER_OCR_PROMPT, 'チラシOCR-PDF(Groq)');
        if (result) { console.log(`[チラシOCR] PDF+Groq 成功`); break; }
      }
    }
    // 5. OCR.space（PDFネイティブ）
    if (!result && process.env.OCR_SPACE_API_KEY) {
      const ocrSpaceText = await callOcrSpaceText(base64, 'application/pdf', 'チラシOCR-PDF(OCR.space)');
      if (ocrSpaceText) result = structureOcrText(ocrSpaceText, 'full', 'ocrspace');
    }
    // 6. Mistral OCR（PDFネイティブ）
    if (!result) result = await callMistralOcr(base64, 'application/pdf', 'チラシOCR-PDF(Mistral)');
    // 7. Gemini Flash（フォールバック）
    if (!result && process.env.GEMINI_API_KEY) {
      result = await callGeminiOcr([
        { inline_data: { mime_type: 'application/pdf', data: base64 } },
        { text: FLYER_OCR_PROMPT },
      ], 'チラシOCR-PDF(Gemini)');
    }
  } else {
    const prep = await prepareImageForOcr(dl.buf, dl.mime, 'チラシOCR');
    const imgBase64 = prep.buf.toString('base64');
    // 2a. ローカル Tesseract
    const tessText = await tryTesseractOcr(prep.buf);
    if (tessText) {
      result = structureOcrText(tessText, 'full', 'tesseract');
      if (result) console.log(`[チラシOCR] Tesseract 成功: ${url.split('/').pop()}`);
    }
    // 2b. RapidOCR
    if (!result) {
      const rapidText = await tryRapidOcr(prep.buf, 'チラシOCR');
      if (rapidText) {
        result = structureOcrText(rapidText, 'full', 'rapidocr');
        if (result) console.log(`[チラシOCR] RapidOCR 成功: ${url.split('/').pop()}`);
      }
    }
    // 2c. Groq Vision
    if (!result && prep.ok && process.env.GROQ_API_KEY) {
      result = await callGroqOcr(imgBase64, prep.mime, FLYER_OCR_PROMPT, 'チラシOCR(Groq)');
    }
    // 2d. OCR.space
    if (!result && prep.ok && process.env.OCR_SPACE_API_KEY) {
      const ocrSpaceText = await callOcrSpaceText(imgBase64, prep.mime, 'チラシOCR(OCR.space)');
      if (ocrSpaceText) result = structureOcrText(ocrSpaceText, 'full', 'ocrspace');
    }
    // 2e. Mistral OCR（画像）
    if (!result && prep.ok) {
      result = await callMistralOcr(imgBase64, prep.mime, 'チラシOCR(Mistral)');
    }
    // 2f. Gemini Flash
    if (!result && prep.ok && process.env.GEMINI_API_KEY) {
      result = await callGeminiOcr([
        { inline_data: { mime_type: prep.mime, data: imgBase64 } },
        { text: FLYER_OCR_PROMPT },
      ], 'チラシOCR(Gemini)');
    }
  }

  if (result) assetCache.set(dl.hash, { ocr_status: "success", last_ocr_at: new Date().toISOString(), url, result });
  return result;
}

/**
 * _flyerUrl を持つスタブイベントに対してチラシOCRを実行し、
 * date・title・place 等を補完して返す。date が取れないまたは過去の場合は除外。
 * 近畿WP系地本（三重・滋賀・奈良・和歌山）向け。
 */
async function enrichFromFlyer(events, prefLabel) {
  const results = [];
  const ocrReady = await hasAnyOcrEngine();
  for (const ev of events) {
    if (!ev._flyerUrl) {
      results.push(ev);
      continue;
    }
    if (!ocrReady) {
      // OCRエンジンなし → スタブは捨てる
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

    // OCR日付を解析（表記ゆれ吸収は lib/ocrDate.js に集約）
    const parsedOcrDate = parseOcrDate(ocr.date);
    const dateStr = parsedOcrDate ? parsedOcrDate.dateStr : '';
    const weekday = parsedOcrDate ? parsedOcrDate.weekday : '';

    if (!dateStr || isPast(dateStr)) {
      console.log(`  → 過去またはスキップ: ${ocr.date}`);
      continue;
    }

    const { _flyerUrl, ...baseEv } = ev;
    const title   = (ocr.title && fixOcrTitle(safeStr(ocr.title))) || ev.title;
    const idBase  = ev.id.split('-')[0];  // 例: 'na', 'mi', 'sh', 'wk'
    results.push({
      ...baseEv,
      id:             `${idBase}-${dateStr.replace(/-/g, '')}-${titleHash(dateStr, title)}`,
      date:           dateStr,
      weekday,
      title,
      place:          (safeStr(ocr.place))          || '',
      time:           safeStr(ocr.time)           || '',
      ageRequirement: safeStr(ocr.ageRequirement) || null,
      deadline:       safeStr(ocr.deadline)       || null,
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
  "title": "ポスター${OCR_TITLE_RULE}",
  "date": "開催日（「令和X年Y月Z日（曜日）」の形式で。例: 令和8年5月19日（火））",
  "place": "開催場所・見学先の名称",
  "time": "開催時間（例: 10:00～16:00）",
  "ageRequirement": "参加資格・対象者を簡潔に（例: 中学生以上33歳未満、日本国籍を有する方）",
  "deadline": "${OCR_DEADLINE_RULE}",
  "notes": "定員・抽選有無・注意事項など重要事項のみ50文字以内で簡潔に"
}`;

/**
 * 画像 1 枚から全イベント情報（日付・場所含む）を OCR する（栃木・富山・兵庫用）。
 * ハッシュキャッシュ対応。Tesseract → RapidOCR → Groq → OCR.space → Gemini の順で試みる。
 */
async function ocrImageFull(imageUrl) {
  if (!imageUrl) return null;

  const dl = await downloadFile(imageUrl);
  if (!dl) return null;

  // ハッシュベースキャッシュ確認
  if (assetCache.getByHash(dl.hash) && assetCache.getByHash(dl.hash).result) {
    ocrStats.cacheHits++;
    console.log(`[OCR-FULL] キャッシュヒット: ${imageUrl.split('/').pop()}`);
    return assetCache.getByHash(dl.hash).result;
  }

  const prep = await prepareImageForOcr(dl.buf, dl.mime, 'OCR-FULL');
  const base64 = prep.buf.toString('base64');
  ocrStats.attempted++;   // キャッシュミス → 実際にOCRを走らせる
  let result = null;

  // 1. ローカル Tesseract
  const tessText = await tryTesseractOcr(prep.buf);
  if (tessText) {
    result = structureOcrText(tessText, 'full', 'tesseract');
    if (result) console.log(`[OCR-FULL] Tesseract 成功: ${imageUrl.split('/').pop()}`);
  }

  // 2. RapidOCR
  if (!result) {
    const rapidText = await tryRapidOcr(prep.buf, 'OCR-FULL');
    if (rapidText) {
      result = structureOcrText(rapidText, 'full', 'rapidocr');
      if (result) console.log(`[OCR-FULL] RapidOCR 成功: ${imageUrl.split('/').pop()}`);
    }
  }

  // 3. Groq Vision
  if (!result && prep.ok && process.env.GROQ_API_KEY) {
    result = await callGroqOcr(base64, prep.mime, OCR_PROMPT_FULL, 'OCR-FULL');
  }
  // 4. OCR.space
  if (!result && prep.ok && process.env.OCR_SPACE_API_KEY) {
    const ocrSpaceText = await callOcrSpaceText(base64, prep.mime, 'OCR-FULL(OCR.space)');
    if (ocrSpaceText) result = structureOcrText(ocrSpaceText, 'full', 'ocrspace');
  }
  // 5. Gemini Flash
  if (!result && prep.ok && process.env.GEMINI_API_KEY) {
    result = await callGeminiOcr([
      { inline_data: { mime_type: prep.mime, data: base64 } },
      { text: OCR_PROMPT_FULL },
    ], 'OCR-FULL');
  }

  if (result) assetCache.set(dl.hash, { ocr_status: "success", last_ocr_at: new Date().toISOString(), url: imageUrl, result });
  return result;
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
    // HTMLパース済みタイトルを優先し、OCRタイトルは未取得時のみ補完
    title:          ev.title || (ocr.title && fixOcrTitle(safeStr(ocr.title))) || '',
    // HTMLパース済みの place を優先し、空の場合のみ OCR で補完
    // （writeOutput の cleanPlaceText / splitPlaceAddress が最終整形する）
    place:          ev.place || safeStr(ocr.place) || '',
    time:           safeStr(ocr.time)           || ev.time  || '',
    ageRequirement: safeStr(ocr.ageRequirement) || ev.ageRequirement || null,
    deadline:       safeStr(ocr.deadline)       || ev.deadline       || null,
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
  if (!await hasAnyOcrEngine()) {
    console.log('[OCR] 利用可能なOCRエンジンがないためスキップ');
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
 * 神奈川イベントページが正常に取得できたか構造で判定する。
 * Cloudflare チャレンジ/ブロックページ（HTTP 200 で返ることもある）は
 * 「イベント一覧」見出しを持たないため、これで本物のページと区別できる。
 * これにより、ブロック時に 0 件で既存データを上書きする事故を防ぐ。
 */
function hasKanagawaEventStructure($) {
  let found = false;
  $('h3, H3').each((_i, el) => {
    if ($(el).text().includes('イベント一覧')) { found = true; return false; }
  });
  return found;
}

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
    // イベント一覧の構造が無ければチャレンジ/ブロックページとみなし fetch へ
    if (!hasKanagawaEventStructure($)) {
      throw new Error('イベント一覧の構造が見つかりません（チャレンジ/ブロックの可能性）');
    }
    const events = parseKanagawa($);
    console.log(`[神奈川] ${events.length} 件取得 (Playwright)`);
    return events;
  } catch (err) {
    console.warn(`[神奈川] Playwright 失敗: ${err.message} → fetch にフォールバック`);
  } finally {
    await page.close();
  }

  // ── native fetch + iconv フォールバック ──
  const res = await fetchWithTimeout(URLS.kanagawa, {
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
  // fetch フォールバックでもチャレンジページ（イベント一覧構造なし）なら
  // 0 件で既存データを上書きしないよう例外にして前回データを維持させる
  if (!hasKanagawaEventStructure($)) {
    throw new Error('fetch でもイベント一覧構造を取得できず（Cloudflare 403/チャレンジの可能性）');
  }
  const events = parseKanagawa($);
  console.log(`[神奈川] ${events.length} 件取得 (fetch fallback)`);
  return events;
}

/**
 * 東京地本イベントを取得・パース（2026年新サイト構造）。
 * 旧 /pco/tokyo/<office>/event.html は廃止(404)。現在のイベントは
 * event2/calendar.js の `const EVENTS` に集約されているため、これを取得して解析する。
 * 取得は素の fetch（ブラウザUA）→失敗時 Playwright(同一コンテキストのcf_clearance活用)。
 */
async function fetchTokyo(context) {
  const { parseTokyoCalendar, CALENDAR_URL } = require('./parsers/tokyoCalendar');
  console.log(`[東京] アクセス: ${CALENDAR_URL}`);

  let js = '';
  try {
    const res = await fetchWithTimeout(CALENDAR_URL, {
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept':          '*/*',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
        'Referer':         'https://www.mod.go.jp/pco/tokyo/event2/index.html',
      },
    });
    if (res.ok) js = await res.text();
  } catch (e) {
    console.warn(`[東京] fetch 失敗: ${e.message} → Playwright にフォールバック`);
  }

  if (!js) {
    const page = await context.newPage();
    try {
      await page.goto('https://www.mod.go.jp/pco/tokyo/event2/index.html', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      js = await page.evaluate(async (u) => {
        try { const r = await fetchWithTimeout(u); return r.ok ? await r.text() : ''; } catch { return ''; }
      }, CALENDAR_URL);
    } finally {
      await page.close();
    }
  }

  const events = parseTokyoCalendar(js);
  console.log(`[東京] ${events.length} 件取得 (calendar.js)`);
  // 0件は構造変化/取得失敗の可能性 → 例外にして前回データを維持（誤って空にしない）
  if (events.length === 0) throw new Error('東京 calendar.js から 0 件（取得失敗 or 構造変化）');
  return events;
}

/**
 * メインページのイベントとサブページ（採用説明会等）のイベントをマージする。
 * サブページ取得が失敗（subOk=false）または0件の場合は、前回 events.json に
 * あったサブページ由来イベント（メインに無く未来日付のもの）を維持することで、
 * Cloudflare 等の間欠的失敗でサブページ分のイベントが消えるのを防ぐ。
 */
function mergeSubpageEvents(main, sub, subOk, prefKey, label) {
  const mainIds = new Set(main.map(e => e.id));
  let extra = sub.filter(e => !mainIds.has(e.id));

  if (!subOk || sub.length === 0) {
    try {
      const prevAll   = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
      const prevExtra = (prevAll[prefKey] || [])
        .filter(e => !mainIds.has(e.id) && e.date && !isPast(e.date));
      if (prevExtra.length > extra.length) {
        console.warn(`[${label}] サブページ取得失敗/0件 → 前回のサブページ ${prevExtra.length}件を維持`);
        extra = prevExtra;
      }
    } catch { /* events.json 未存在は無視 */ }
  }

  const seen   = new Set(mainIds);
  const merged = [...main];
  for (const ev of extra) {
    if (!seen.has(ev.id)) { seen.add(ev.id); merged.push(ev); }
  }
  console.log(`[${label}] 合計 ${merged.length} 件（メイン ${main.length} + サブ ${extra.length}）`);
  return merged.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 埼玉地本ページを取得・パース。
 * `/event/`（一般イベント）に加え、`/job-fair/`（各事務所の採用説明会情報）も
 * 取得してマージする。説明会ページは同一の section.subSec 構造のため
 * parseSaitama を baseUrl 切り替えで共用する。
 */
async function fetchSaitama(context) {
  const main = await fetchHtmlPref(context, '埼玉', URLS.saitama, parseSaitama);

  // 採用説明会情報（各事務所の説明会イベント）。失敗時は前回分を維持。
  let jobFair = [];
  let jobFairOk = false;
  try {
    await sleep(BETWEEN_PAGES_MS);
    jobFair = await fetchHtmlPref(
      context, '埼玉(説明会)', URLS.saitamaJobFair,
      $ => parseSaitama($, URLS.saitamaJobFair),
    );
    jobFairOk = true;
  } catch (err) {
    console.warn(`[埼玉] 説明会ページ取得失敗: ${err.message}`);
  }

  return mergeSubpageEvents(main, jobFair, jobFairOk, 'saitama', '埼玉');
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

  const res = await fetchWithTimeout(url, {
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
const fetchChiba     = (ctx) => fetchHtmlPref(ctx, '千葉', URLS.chiba,     parseChiba);

/**
 * 茨城地本: event.html（一般イベント）に加え、setsumeikai.html（各事務所の
 * 採用説明会スケジュール表）も取得してマージする。
 */
async function fetchIbaraki(context) {
  const main = await fetchHtmlPref(context, '茨城', URLS.ibaraki, parseIbaraki);

  let setsu = [];
  let setsuOk = false;
  try {
    await sleep(BETWEEN_PAGES_MS);
    setsu = await fetchHtmlPref(
      context, '茨城(説明会)', URLS.ibarakiSetsumeikai, parseIbarakiSetsumeikai,
    );
    setsuOk = true;
  } catch (err) {
    console.warn(`[茨城] 説明会ページ取得失敗: ${err.message}`);
  }

  return mergeSubpageEvents(main, setsu, setsuOk, 'ibaraki', '茨城');
}
// 近畿地本（HTML スクレイピング）
/**
 * 京都地本: kouhoushitsu（イベント）に加え、boshuka/jieikan/setsumeikai.html
 * （各事務所の募集採用説明会）も取得してマージする。
 */
async function fetchKyoto(context) {
  const main = await fetchHtmlPref(context, '京都', URLS.kyoto, parseKyoto);
  let setsu = [], setsuOk = false;
  try {
    await sleep(BETWEEN_PAGES_MS);
    setsu = await fetchHtmlPref(context, '京都(説明会)', URLS.kyotoSetsumeikai, parseKyotoSetsumeikai);
    setsuOk = true;
  } catch (err) {
    console.warn(`[京都] 説明会ページ取得失敗: ${err.message}`);
  }
  return mergeSubpageEvents(main, setsu, setsuOk, 'kyoto', '京都');
}
/**
 * 大阪地本: experience/event.html（体験イベント）に加え、
 * recruit/session/menu.html（各事務所の募集説明会）も取得してマージする。
 */
async function fetchOsaka(context) {
  const main = await fetchHtmlPref(context, '大阪', URLS.osaka, parseOsaka);
  let setsu = [], setsuOk = false;
  try {
    await sleep(BETWEEN_PAGES_MS);
    setsu = await fetchHtmlPref(context, '大阪(説明会)', URLS.osakaSession, parseOsakaSession);
    setsuOk = true;
  } catch (err) {
    console.warn(`[大阪] 説明会ページ取得失敗: ${err.message}`);
  }
  return mergeSubpageEvents(main, setsu, setsuOk, 'osaka', '大阪');
}
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
 * 広島: カレンダー（calendarEvents JSON）から一覧を取得し、
 * place が空のイベントは WP 詳細ページ（events/NNNN/）本文の
 * 「場所▶…」「場所：…」行から place / time を補完する。
 */
async function fetchHiroshima(ctx) {
  const events = await fetchHtmlPref(ctx, '広島', URLS.hiroshima, parseHiroshima);

  let enriched = 0;
  for (const ev of events) {
    if (!ev.url || ev.place || !/\/events\/\d+/.test(ev.url)) continue;
    try {
      const page = await ctx.newPage();
      try {
        await page.goto(ev.url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
        await page.waitForTimeout(1500);
        const html = await page.content();
        const $ = cheerio.load(html, { decodeEntities: false });
        const detail = parseHiroshimaDetail($);
        if (detail.place) { ev.place = detail.place; enriched++; }
        if (detail.time && !ev.time) ev.time = detail.time;
      } finally {
        await page.close();
      }
    } catch {
      // 詳細取得失敗は無視（place は空文字のまま）
    }
  }
  if (enriched > 0) console.log(`[広島] 詳細ページから place 補完: ${enriched}件`);
  return events;
}

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
    const res = await fetchWithTimeout(url, {
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
  const res = await fetchWithTimeout(URLS.nagano, {
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
    // 表記ゆれ吸収は lib/ocrDate.js に集約（曜日カッコ無し・年なしにも対応）
    const parsedTextDate = parseOcrDate(containerText);
    let textDate    = parsedTextDate ? parsedTextDate.dateStr : '';
    let textWeekday = parsedTextDate ? parsedTextDate.weekday : '';

    if (!rawTitle) return;  // タイトルなし → スキップ

    // タイトルテキストから "6/14" "7/11" などの月/日形式の日付も抽出を試みる
    if (!textDate) {
      const titleWithContainer = toHalfWidth((rawTitle + ' ' + containerText).substring(0, 200));
      // "6/14" or "6月14日" in title/anchor text
      const slashM = titleWithContainer.match(/(\d{1,2})\/(\d{1,2})(?!\d)/);
      if (slashM) {
        const now = new Date();
        const m = parseInt(slashM[1], 10), d = parseInt(slashM[2], 10);
        if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
          textDate = `${now.getFullYear()}-${padTwo(m)}-${padTwo(d)}`;
        }
      }
    }

    if (!textDate) {
      // 日付が取れない → リンクスタブ（タイトル + 公式 URL のみ、日程未定）
      // CF ブロックで個別投稿を取得できない場合の最終フォールバック
      const cleanTitle = rawTitle
        .replace(/\d{4}\.\d{2}\.\d{2}/g, '')                               // YYYY.MM.DD 形式の日付
        .replace(/令和\d+年\d+月\d+日[（(][月火水木金土日祝]+[）)]/g, '')   // 令和年号の日付
        .replace(/\d{4}年\d+月\d+日[（(][月火水木金土日祝]+[）)]/g, '')     // 西暦の日付
        .replace(/\d+月\d+日[（(][月火水木金土日祝]+[）)]/g, '')             // 月日のみの日付
        .replace(/^\s*NEW\s*|\s*NEW\s*$/gi, '')                             // NEW ラベル
        .replace(/^\s*イベント情報\s*|\s*イベント情報\s*$/g, '')             // カテゴリ接頭辞
        .replace(/\s+/g, ' ')
        .trim();
      if (!cleanTitle) return;  // クリーン後に空になったらスキップ

      stubs.push({
        id:             `${idPrefix}-link-${++counter}`,
        pref:           prefKey,
        date:           '', weekday: '',
        title:          cleanTitle.substring(0, 60),
        place:          '', address: '', time: '',
        category:       guessCategory(toHalfWidth(cleanTitle)),
        tag:            guessTag(cleanTitle),
        url:            matchUrl,
        notes:          '日時・場所等の詳細は公式サイトをご確認ください',
        ageRequirement: null, deadline: null, imageUrl: '',
      });
      return;
    }

    if (isPast(textDate)) return;  // 過去イベント → スキップ

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
  const textStubs = stubs.filter(s => !s._flyerUrl && s.date);
  const linkStubs = stubs.filter(s => !s._flyerUrl && !s.date);
  if (imgStubs.length > 0)  console.log(`[${prefLabel}] 一覧ページ画像スタブ: ${imgStubs.length} 件 (${imgStubs.map(s => s._flyerUrl.split('/').pop()).join(', ')})`);
  if (textStubs.length > 0) console.log(`[${prefLabel}] 一覧ページテキストスタブ: ${textStubs.length} 件 (${textStubs.map(s => `${s.date} ${s.title.substring(0,20)}`).join(', ')})`);
  if (linkStubs.length > 0) console.log(`[${prefLabel}] 一覧ページリンクスタブ: ${linkStubs.length} 件 (${linkStubs.map(s => s.title.substring(0, 20)).join(', ')})`);
  if (stubs.length === 0)   console.log(`[${prefLabel}] 一覧ページ画像スタブ: 0 件 ()`);
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
  // 一覧スタブがある URL のセット（goto 成功時にスタブより HTML を優先するため参照する）
  const listStubUrlSet = new Set(listStubs.map(s => s.url));

  const events = [];
  const succeededUrls = new Set();
  let counter  = 0;

  // 個別投稿を取得する（2段階戦略）:
  // 1st: listPage で同一タブ遷移（CF クリアランス再利用）
  // 2nd: 新規ページで取得（1st が失敗した場合のフォールバック）
  for (const postUrl of postUrls) {
    const slug = postUrl.replace(/\/$/, '').split('/').pop();
    const hasStub = listStubUrlSet.has(postUrl);
    let html = null;

    // 1st: listPage の同一タブで遷移（?_=timestamp でCFパターンマッチ回避）
    const fetchUrl = postUrl + (postUrl.includes('?') ? '&' : '?') + '_=' + Date.now();
    try {
      const res = await listPage.goto(fetchUrl, { waitUntil: 'commit', timeout: 10_000, referer: listUrl });
      if (res) html = await res.text();
    } catch (err) {
      console.warn(`[${pref}] ${slug} 取得失敗(tab1): ${err.message.substring(0, 40)}`);
    }

    // 2nd: 新規ページで取得（listPage が CF に再ブロックされた場合のフォールバック）
    if (!html || html.length < 500) {
      const freshPage = await ctx.newPage();
      try {
        await freshPage.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 15_000, referer: listUrl });
        await freshPage.waitForTimeout(1500);
        html = await freshPage.content();
      } catch (err) {
        // サイレントに失敗（スタブが代替）
      } finally {
        await freshPage.close();
      }
    }

    if (!html) { await sleep(500); continue; }

    // CF チャレンジ判定ヘルパー
    const checkCf = ($inner) => {
      const bt = $inner('body').text().replace(/\s+/g, ' ').trim();
      return bt.length < 100 || /Just a moment|Enable JavaScript and cookies|しばらくお待ちください/i.test(bt);
    };

    try {
      let $ = cheerio.load(html, { decodeEntities: false });

      // 1stパスでCFブロックを検出 → 新規ページで再試行
      if (checkCf($)) {
        if (!hasStub) console.log(`[${pref}] ${slug} → CF検出、新規ページで再試行...`);
        const freshPage = await ctx.newPage();
        try {
          await freshPage.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 20_000, referer: listUrl });
          await freshPage.waitForTimeout(2000);
          const freshHtml = await freshPage.content();
          if (freshHtml && freshHtml.length > 500) {
            const $fresh = cheerio.load(freshHtml, { decodeEntities: false });
            if (!checkCf($fresh)) {
              $ = $fresh;
              html = freshHtml;
              console.log(`[${pref}] ${slug} → 新規ページで取得成功`);
            }
          }
        } catch { /* サイレントに失敗 */ } finally {
          await freshPage.close();
        }
      }

      const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
      if (bodyText.length < 100 || /Just a moment|Enable JavaScript|しばらくお待ちください/i.test(bodyText)) {
        if (!hasStub) console.log(`[${pref}] ${slug} → CF ブロック (bodyLen=${bodyText.length})`);
      } else {
        const evs = postFn($, postUrl, ++counter);
        if (evs.length) {
          console.log(`[${pref}] ${slug} → ${evs[0].date} ${evs[0].title.substring(0,30)}`);
          events.push(...evs);
          succeededUrls.add(postUrl);
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

  // 一覧スタブをそのまま追加（in-page fetch で取得できなかった分をカバー）
  // - 画像/PDF スタブ: OCR に渡して日付・内容を補完
  // - リンクスタブ（date=""）: CF ブロックで個別投稿取得不能 → タイトル+URL のみ表示
  if (listStubs.length > 0) {
    const nonSucceeded = listStubs.filter(s => !succeededUrls.has(s.url));
    if (nonSucceeded.length > 0) {
      const ocrCount  = nonSucceeded.filter(s => s._flyerUrl).length;            // 画像/PDF → OCR
      const textCount = nonSucceeded.filter(s => !s._flyerUrl && s.date).length;  // テキスト日付あり
      const linkCount = nonSucceeded.filter(s => !s._flyerUrl && !s.date).length; // CF ブロック → リンクのみ
      if (ocrCount > 0)   console.log(`[${pref}] 一覧スタブ ${ocrCount} 件を追加 (OCR待ち)`);
      if (textCount > 0)  console.log(`[${pref}] 一覧スタブ ${textCount} 件を追加 (テキスト日付)`);
      if (linkCount > 0)  console.log(`[${pref}] 一覧スタブ ${linkCount} 件を追加 (日程未定リンク)`);
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
 * 利用可能なOCRエンジンがない場合は空配列を返す。
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

  if (!await hasAnyOcrEngine()) {
    console.log('[兵庫] 利用可能なOCRエンジンがないため OCR スキップ');
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
      const dtMatch = rawDate.match(/令和\s*(元|\d+)\s*年(\d+)月(\d+)日[（(]([月火水木金土日祝・]+)[）)]/)
        || rawDate.match(/(\d{4})年(\d+)月(\d+)日[（(]([月火水木金土日祝・]+)[）)]/);

      let dateStr = '', weekday = '';
      if (dtMatch && dtMatch[0].startsWith('令和')) {
        const year = reiwaToAD(reiwaNum(dtMatch[1]));
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
 * 利用可能なOCRエンジンがない場合は空配列を返す（OCR スキップ）。
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

  if (!await hasAnyOcrEngine()) {
    console.log('[栃木] 利用可能なOCRエンジンがないため OCR スキップ');
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
 * 利用可能なOCRエンジンがない場合は空配列を返す（OCR スキップ）。
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

  if (!await hasAnyOcrEngine()) {
    console.log('[富山] 利用可能なOCRエンジンがないため OCR スキップ');
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

// ── 募集案内所ページ から PDF/画像を収集してイベントを抽出 ─────────

/**
 * Playwright ステルスコンテキストでページを取得して Cheerio オブジェクトを返す。
 * mod.go.jp は Cloudflare 保護のため素の fetch() では 403 になるため必須。
 * @param {import('playwright').BrowserContext} ctx
 * @param {string} url
 */
async function fetchPagePlaywright(ctx, url) {
  let page = null;
  try {
    page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const html = await page.content();
    return cheerio.load(html);
  } catch (err) {
    console.warn(`  [fetch] エラー: ${url} → ${err.message}`);
    return null;
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

/**
 * OCR結果またはアセット情報から日付文字列・曜日を解析する。
 * @returns {{ dateStr: string, weekday: string }|null}
 */
function parseOcrDate(ocrDate) {
  if (!ocrDate) return null;
  // 表記ゆれの吸収は lib/ocrDate.js に集約している（parseTextToEvent と同じ規則）。
  // 以前はここも曜日カッコ必須で、「2026年8月22日」「8/22（土）」等を取りこぼしていた。
  return parseDateFromText(ocrDate);
}

// ── 関東 各募集案内所の個別ページ（先回り巡回用URL一覧）────────────
// 中央ページが事務所イベントを集約しているが、事務所が独自ページにのみ
// イベント（主にチラシ PDF/画像）を掲載する可能性に備え、毎回巡回する。
// 日付入りチラシ／イベント系チラシが無ければ即スキップ（高速）。
const KANTO_OFFICE_URLS = {
  ibaraki: [
    'https://www.mod.go.jp/pco/ibaraki/jimusho/hitachi.html',
    'https://www.mod.go.jp/pco/ibaraki/jimusho/mito.html',
    'https://www.mod.go.jp/pco/ibaraki/jimusho/tsuchiura.html',
    'https://www.mod.go.jp/pco/ibaraki/jimusho/ryugasaki.html',
    'https://www.mod.go.jp/pco/ibaraki/jimusho/chikusei.html',
  ],
  gunma: [
    'https://www.mod.go.jp/pco/gunma/bosyuannai/maebashi_sho/maebashi.html',
    'https://www.mod.go.jp/pco/gunma/bosyuannai/oota_sho/oota.html',
    'https://www.mod.go.jp/pco/gunma/bosyuannai/takasaki_sho/takasaki.html',
    'https://www.mod.go.jp/pco/gunma/bosyuannai/numata_sho/numata.html',
  ],
  tochigi: [
    'https://www.mod.go.jp/pco/tochigi/jimusyo_mohka.html',
    'https://www.mod.go.jp/pco/tochigi/jimusyo_oyama.html',
    'https://www.mod.go.jp/pco/tochigi/jimusyo_ashikaga.html',
  ],
  chiba: [
    'https://www.mod.go.jp/pco/chiba/map/itikawatop.html',
    'https://www.mod.go.jp/pco/chiba/map/funabashitop.html',
    'https://www.mod.go.jp/pco/chiba/map/narita.html',
    'https://www.mod.go.jp/pco/chiba/map/mobara.html',
    'https://www.mod.go.jp/pco/chiba/map/kisaradu.html',
  ],
  saitama: [
    'https://www.mod.go.jp/pco/saitama/office/asaka-office.html',
    'https://www.mod.go.jp/pco/saitama/office/saitama-office.html',
    'https://www.mod.go.jp/pco/saitama/office/iruma-office.html',
    'https://www.mod.go.jp/pco/saitama/office/kumagaya-office.html',
    'https://www.mod.go.jp/pco/saitama/office/chichibu-office.html',
  ],
  // 東京の旧 /pco/tokyo/<office>/event.html は廃止(404)。イベントは fetchTokyo が
  // event2/calendar.js から取得するため、ここでの巡回対象からは除外する。
  kanagawa: [
    'yokosuka', 'atugi', 'kamiooka', 'kawasaki', 'ichigao', 'mizo',
    'fujisawa', 'chuou', 'yokohama', 'hiratuka', 'sagami', 'odawara',
  ].map(s => `https://www.mod.go.jp/pco/kanagawa/mado/${s}/${s}.html`),
};

const KANTO_PREFS = new Set(Object.keys(KANTO_OFFICE_URLS));

const OFFICE_EVENT_KW = /イベント|説明会|相談会|見学|体験|公開|フェス|まつり|祭|広報|採用|募集|セミナー|ガイダンス|インターン|オープンキャンパス|フェア|ブース|出張|公務員|自衛官/;
const OFFICE_ASSET_URL_KW = /event|events|oshirase|news|topics|setsumei|session|recruit|saiyou|bosyu|kouho|chirashi|annai|fair|fes|taiken|kengaku|schedule|calendar/i;
const OFFICE_SKIP_TEXT_KW = /所在地|住所|電話|TEL|FAX|アクセス|地図|お問い合わせ|メール|受付時間|Copyright|プライバシー|サイトマップ|募集案内所の紹介|地域事務所の紹介|所長|事務所紹介/;
const OFFICE_SKIP_ASSET_KW = /logo|icon|banner|btn|common|arrow|header|footer|sns|line|instagram|facebook|youtube|map|access|profile|staff|photo|album|gallery|sitemap/i;

function compactText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function decodeForMatch(text) {
  try { return decodeURIComponent(text); } catch { return text || ''; }
}

function officeNamesLabel(names) {
  const uniq = [...new Set((names || []).filter(Boolean))];
  if (uniq.length <= 3) return uniq.join('・');
  return `${uniq.slice(0, 3).join('・')} ほか${uniq.length - 3}拠点`;
}

function loadRecruitmentOfficePages({ excludePrefs = new Set() } = {}) {
  const pages = new Map();
  try {
    const officesData = JSON.parse(fs.readFileSync(OFFICES_PATH, 'utf8'));
    for (const o of officesData.offices || []) {
      if (!o.url || o.type === 'hq' || excludePrefs.has(o.pref)) continue;
      const norm = normalizeUrl(o.url);
      if (!norm) continue;
      const key = `${o.pref}|${norm}`;
      if (!pages.has(key)) {
        pages.set(key, {
          pref: o.pref,
          url: o.url,
          normalized: norm,
          officeNames: [],
        });
      }
      pages.get(key).officeNames.push(o.name);
    }
  } catch (err) {
    console.warn(`[OfficeOCR] offices.json 読み込み失敗: ${err.message}`);
  }
  return [...pages.values()].sort((a, b) => `${a.pref}|${a.normalized}`.localeCompare(`${b.pref}|${b.normalized}`));
}

function parseOfficeEventDate(text) {
  const t = toHalfWidth(compactText(text));
  const now = new Date(Date.now() + 9 * 3600 * 1000);

  const build = (year, month, day, weekday = '') => {
    const y = Number(year), m = Number(month), d = Number(day);
    if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    const dateStr = `${y}-${padTwo(m)}-${padTwo(d)}`;
    if (isPast(dateStr)) return null;
    return { dateStr, weekday: weekday || calcWeekday(dateStr) };
  };

  // 令和（「元年」含む）/ R表記。元 → 1。過去日付は build() の isPast で除外。
  let m = t.match(/(?:令和|R|Ｒ)\s*(元|\d{1,2})\s*年?\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?(?:[（(]\s*([月火水木金土日祝])\s*[）)])?/i);
  if (m) return build(reiwaToAD(reiwaNum(m[1])), m[2], m[3], m[4]);

  // 平成（「元年」含む）。ほぼ確実に過去 → build() の isPast で除外される。
  m = t.match(/平成\s*(元|\d{1,2})\s*年?\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?(?:[（(]\s*([月火水木金土日祝])\s*[）)])?/);
  if (m) return build(HEISEI_BASE + reiwaNum(m[1]), m[2], m[3], m[4]);

  m = t.match(/(20\d{2})\s*[年\/.-]\s*(\d{1,2})\s*(?:月|[\/.-])\s*(\d{1,2})\s*日?(?:[（(]\s*([月火水木金土日祝])\s*[）)])?/);
  if (m) return build(m[1], m[2], m[3], m[4]);

  // 年が無い「M月D日（曜）」: 曜日と整合する年を厳格に確定（合わなければ却下）。
  m = t.match(/(?:^|[^\d])(\d{1,2})\s*[月\/.]\s*(\d{1,2})\s*日?(?:[（(]\s*([月火水木金土日祝])\s*[）)])?/);
  if (m) {
    const yr = resolveYearByWeekday(m[1], m[2], m[3], now.getFullYear());
    if (yr == null) return null; // 曜日が直近の将来と不一致＝古いチラシ/誤読 → 確定しない
    return build(yr, m[1], m[2], m[3]);
  }

  return null;
}

// 募集案内所イベントの整形・非イベント判定は共通モジュール(shared/officeTitle.cjs)に一本化。
// 既存の呼び出し契約に合わせた薄いラッパー。
const isOfficeJunkText    = (text) => officeIsJunk(text);
const cleanOfficeEventTitle = (text) => cleanOfficeTitle(text) || '募集案内所イベント';

/**
 * 出力直前に全イベントのタイトルを最終整形する（収集後の整形チョークポイント）。
 * events.json に綺麗なタイトルを書き出すことで、アプリ表示だけでなく
 * プッシュ通知（events.json のタイトルを直接使用）も整形済みになる。
 */
function finalizeTitle(title, sourceType) {
  if (!title) return title;
  // 全イベント共通: 末尾の誘導文言（詳細はこちら 等）を除去
  let t = stripTrailingCta(compactText(title));
  // 募集案内所イベントは表ヘッダー・時間/場所・注記なども除去
  if (typeof sourceType === 'string' && sourceType.startsWith('office')) {
    t = cleanOfficeTitle(t);
  }
  t = t.replace(/\s+/g, ' ').replace(/^[\s／/:：、,．.\-–—~〜]+|[\s／/:：、,．.\-–—~〜]+$/g, '').trim();
  return t || title;
}

function officeNotes(meta, extra = null) {
  const label = officeNamesLabel(meta.officeNames);
  return [`掲載元: ${label || '募集案内所・地域事務所'}`, extra].filter(Boolean).join('\n') || null;
}

function makeOfficeEvent({ meta, parsed, title, place, url, notes, sourceType, time = '', ageRequirement = null, deadline = null }) {
  const prefCode = (meta.pref || 'xx').slice(0, 2);
  const safeTitle = fixOcrTitle(safeStr(title)) || '募集案内所イベント';
  return {
    id:             `${prefCode}-office-${parsed.dateStr.replace(/-/g, '')}-${titleHash(parsed.dateStr, `${url}|${safeTitle}|${meta.pref}`)}`,
    pref:           meta.pref,
    date:           parsed.dateStr,
    weekday:        parsed.weekday,
    title:          safeTitle,
    place:          safeStr(place) || officeNamesLabel(meta.officeNames),
    address:        '',
    time:           safeStr(time) || '',
    category:       guessCategory(toHalfWidth(safeTitle)),
    tag:            guessTag(safeTitle),
    url,
    notes:          officeNotes(meta, notes),
    ageRequirement,
    deadline,
    source_type:    sourceType,
  };
}

// 表（table）を行・列単位で解析し、日付/名称/場所を列ごとに取得する。
// 「月日（曜日） イベント名 場 所 …」のように1行へ潰れる不具合を防ぎ、場所も拾える。
function extractOfficeTableEvents($, table, pageUrl, meta, seen, events) {
  const rows = $(table).find('tr');
  if (rows.length < 2) return; // ヘッダ＋データが必要
  // ヘッダ行（見出し語を含む最初の行）と列見出しを推定
  let headerIdx = -1;
  let cols = [];
  rows.each((ri, tr) => {
    if (headerIdx >= 0) return;
    const cells = $(tr).find('th,td').map((_c, c) => compactText($(c).text())).get();
    if (/月日|日付|日時|開催日|期日|曜日|イベント|行事|名称|内容|場所|会場|時間/.test(cells.join(' '))) {
      headerIdx = ri; cols = cells;
    }
  });
  // 見出しは「場 所」のように空白入りのことがあるため、空白を除去して照合する
  const colOf = (re, fb) => { const i = cols.findIndex(c => re.test(c.replace(/\s/g, ''))); return i >= 0 ? i : fb; };
  const dateCol  = colOf(/月日|日付|日時|開催日|期日/, 0);
  const titleCol = colOf(/イベント|行事|名称|内容|催/, 1);
  const placeCol = colOf(/場所|会場|開催地/, -1);

  rows.each((ri, tr) => {
    if (ri <= headerIdx) return; // ヘッダ行以前はスキップ
    const cells = $(tr).find('td,th').map((_c, c) => compactText($(c).text())).get();
    if (cells.length < 2) return;
    const joined = cells.join(' ');
    if (!OFFICE_EVENT_KW.test(joined) || isOfficeJunkText(joined)) return;
    const parsed = parseOfficeEventDate(cells[dateCol] || '') || parseOfficeEventDate(joined);
    if (!parsed) return;
    const rawTitle = cells[titleCol] || cells.find((c, i) => i !== dateCol && c) || '';
    const title = cleanOfficeTitle(rawTitle) || cleanOfficeTitle(joined);
    if (!title || title.replace(/[\s　]/g, '').length < 4) return;
    if (officeIsJunk(title)) return; // 整形後タイトルが非イベント（フォーム項目等）なら除外
    const place = placeCol >= 0 ? cleanOfficePlace(cells[placeCol] || '') : '';
    const key = `${parsed.dateStr}|${title.slice(0, 40)}`;
    if (seen.has(key)) return;
    seen.add(key);
    events.push(makeOfficeEvent({
      meta, parsed, title,
      place: place || officeNamesLabel(meta.officeNames),
      url: pageUrl, notes: null, sourceType: 'office_html',
    }));
  });
}

function extractOfficeHtmlEvents($, pageUrl, meta) {
  const events = [];
  const seen = new Set();
  // 1) 表は行・列単位で解析（日付/名称/場所を分離）。イベントを抽出できた表だけ「処理済み」とする。
  const handledTables = new Set();
  $('table').each((_t, table) => {
    const before = events.length;
    extractOfficeTableEvents($, table, pageUrl, meta, seen, events);
    if (events.length > before) handledTables.add(table); // データ表（レイアウト表は対象外）
  });
  // 2) 表の外＋レイアウト表の中の要素を従来どおり解析（データ表は上で処理済みなので除外）
  const selector = 'a[href], li, tr, article, section, div[class*="event"], div[class*="news"], div[class*="topic"], div[class*="post"]';
  $(selector).each((_i, el) => {
    const tbl = $(el).closest('table').get(0);
    if (tbl && handledTables.has(tbl)) return; // データ表として整形済み。レイアウト表は通す
    const text = compactText($(el).text());
    if (text.length < 8 || text.length > 220) return;
    if (!OFFICE_EVENT_KW.test(text)) return;
    if (OFFICE_SKIP_TEXT_KW.test(text)) return;
    // 過去報告・制度説明・お知らせ、メール/住所混入・常時開催の案内などはイベントではないので除外
    if (isOfficeJunkText(text)) return;
    // ナビメニュー/カテゴリ一覧の塊（「イベント情報」等の見出し語が複数回出る）は除外
    const navHits = (text.match(/イベント情報|採用試験情報|入札情報|重要なお知らせ|トピックス|お知らせ一覧|すべて/g) || []).length;
    if (navHits >= 2) return;
    const parsed = parseOfficeEventDate(text);
    if (!parsed) return;

    const href = $(el).attr('href') || $(el).find('a[href]').first().attr('href') || '';
    const norm = href ? normalizeUrl(href, pageUrl) : null;
    let url = pageUrl;
    if (norm) {
      try { url = new URL(href, pageUrl).href; } catch { url = norm; }
    }

    const title = cleanOfficeEventTitle(text);
    // 整形した結果ほとんど中身が残らない（救済不能な）ものはイベントにしない
    if (title === '募集案内所イベント' || title.replace(/[\s　]/g, '').length < 4) return;
    if (officeIsJunk(title)) return; // 整形後タイトルが非イベントなら除外
    const key = `${parsed.dateStr}|${title.slice(0, 40)}`;
    if (seen.has(key)) return;
    seen.add(key);
    events.push(makeOfficeEvent({
      meta,
      parsed,
      title,
      place: officeNamesLabel(meta.officeNames),
      url,
      notes: null,
      sourceType: 'office_html',
    }));
  });
  return events;
}

function extractOfficeCandidateAssets($, pageUrl) {
  const seen = new Set();
  const candidates = [];

  function add(rawUrl, text = '') {
    const norm = normalizeUrl(rawUrl, pageUrl);
    if (!norm || !isAssetUrl(norm) || seen.has(norm)) return;
    const haystack = decodeForMatch(`${norm} ${text}`);
    if (OFFICE_SKIP_ASSET_KW.test(haystack)) return;
    const hasDate = !!parseOfficeEventDate(haystack);
    const eventish = OFFICE_EVENT_KW.test(haystack) || OFFICE_ASSET_URL_KW.test(haystack);
    if (!hasDate && !eventish) return;

    let abs;
    try { abs = new URL(rawUrl, pageUrl).href; } catch { abs = norm; }
    seen.add(norm);
    candidates.push({
      url: abs,
      normalized: norm,
      type: isPdfUrl(norm) ? 'pdf' : 'image',
      linkText: compactText(text).slice(0, 120),
      sourcePageUrl: pageUrl,
    });
  }

  $('a[href]').each((_i, el) => add($(el).attr('href') || '', $(el).text()));
  $('img[src]').each((_i, el) => {
    const text = [$(el).attr('alt'), $(el).closest('a').text()].filter(Boolean).join(' ');
    add($(el).attr('src') || '', text);
  });
  return candidates;
}

async function ocrOfficeAssets(assets, meta, maxAssets = 2) {
  const events = [];
  const sorted = sortByPriority(assets).filter(a => a.priority !== 'low').slice(0, maxAssets);
  for (const asset of sorted) {
    const ocr = await ocrFlyerFull(asset.url);
    await sleep(1500);
    const parsed = ocr ? parseOcrDate(ocr.date) : null;
    if (!parsed || isPast(parsed.dateStr)) continue;
    const title = (ocr.title && fixOcrTitle(safeStr(ocr.title))) || asset.linkText || asset.text || '募集案内所イベント';
    events.push(makeOfficeEvent({
      meta,
      parsed,
      title,
      place: safeStr(ocr.place) || officeNamesLabel(meta.officeNames),
      url: asset.url,
      notes: ocr.notes || null,
      sourceType: 'office_ocr',
      time: safeStr(ocr.time) || '',
      ageRequirement: safeStr(ocr.ageRequirement) || null,
      deadline: safeStr(ocr.deadline) || null,
    }));
  }
  return events;
}

/**
 * offices.json の全国募集案内所・地域事務所URLをユニーク化して巡回する。
 * 関東は KANTO_OFFICE_URLS の個別URLが精密なためここでは除外する。
 * HTML本文で日付とイベント語が取れるものはOCRなしで追加し、
 * PDF/画像チラシ候補だけ既存OCRパイプラインへ流す。
 */
async function crawlNationwideOffices(withFreshContext) {
  if (!withFreshContext) return [];
  const pages = loadRecruitmentOfficePages({ excludePrefs: KANTO_PREFS });
  // 既定で全国全件巡回（OFFICE_CRAWL_MAX_PAGES 未指定なら全URLを対象にする）。
  // 環境変数で上限を指定した場合のみその件数に絞る。
  const maxPagesEnv = Number.parseInt(process.env.OFFICE_CRAWL_MAX_PAGES || '', 10);
  const maxPages = Number.isFinite(maxPagesEnv) ? maxPagesEnv : pages.length;
  const maxSubPages = Number.parseInt(process.env.OFFICE_CRAWL_MAX_SUBPAGES || '2', 10);
  const maxAssets = Number.parseInt(process.env.OFFICE_CRAWL_MAX_ASSETS || '2', 10);
  const delayMs = Number.parseInt(process.env.OFFICE_CRAWL_DELAY_MS || '1800', 10);
  const ocrReady = await hasAnyOcrEngine();
  const events = [];
  const seenPages = new Set();
  const targetPages = pages.slice(0, maxPages);

  console.log(`[OfficeOCR] 全国募集案内所 ${targetPages.length}/${pages.length} URLを巡回開始`);
  let index = 0;
  for (const meta of targetPages) {
    index++;
    if (seenPages.has(meta.normalized)) continue;
    seenPages.add(meta.normalized);
    if (index > 1) await sleep(delayMs);
    console.log(`[OfficeOCR] ${index}/${targetPages.length} ${meta.pref} ${officeNamesLabel(meta.officeNames)}: ${meta.url}`);

    const $ = await withFreshContext(ctx => fetchPagePlaywright(ctx, meta.url));
    if (!$) continue;

    events.push(...extractOfficeHtmlEvents($, meta.url, meta));
    if (ocrReady) {
      const directAssets = extractOfficeCandidateAssets($, meta.url);
      if (directAssets.length > 0) {
        events.push(...await ocrOfficeAssets(directAssets, meta, maxAssets));
      }
    }

    const skip = new Set([meta.normalized]);
    const { pages: subPages, assets: linkedAssets } = findEventLinks($, meta.url, skip);
    if (ocrReady && linkedAssets.length > 0) {
      events.push(...await ocrOfficeAssets(linkedAssets, meta, maxAssets));
    }

    let subCount = 0;
    for (const sub of subPages.slice(0, Number.isFinite(maxSubPages) ? maxSubPages : 2)) {
      const norm = normalizeUrl(sub.url);
      if (!norm || seenPages.has(norm)) continue;
      seenPages.add(norm);
      subCount++;
      await sleep(Math.max(800, Math.floor(delayMs / 2)));
      const $sub = await withFreshContext(ctx => fetchPagePlaywright(ctx, sub.url));
      if (!$sub) continue;
      events.push(...extractOfficeHtmlEvents($sub, sub.url, meta));
      if (ocrReady) {
        events.push(...await ocrOfficeAssets(extractOfficeCandidateAssets($sub, sub.url), meta, maxAssets));
      }
      if (subCount >= maxSubPages) break;
    }
  }

  const deduped = markDuplicates(events).filter(e => !e.duplicate_candidate);
  console.log(`[OfficeOCR] 全国募集案内所巡回完了: ${deduped.length}件`);
  return deduped;
}

/**
 * 関東各事務所の個別ページを毎回巡回し、日付入り／イベント系チラシを OCR して
 * 将来イベントを抽出する。候補チラシが無いページは即スキップ（高速）。
 * 同一チラシは assetCache によりOCRが一度きりになるため、繰り返し巡回しても安価。
 * 戻り値: events[]（pref / source_type:'office_crawl' 付き）
 */
async function crawlKantoOffices(withFreshContext) {
  if (!await hasAnyOcrEngine()) {
    console.log('[KantoOffice] 利用可能なOCRエンジンがないためスキップ');
    return [];
  }
  if (!withFreshContext) return [];

  const EVENT_KW = /イベント|説明会|見学|体験|公開|フェス|まつり|祭|相談会|ブース|出張|広報/;
  const SKIP_ASSET = /logo|icon|banner|btn|common|arrow|header|footer|sns|^tw$|^fb$|insta|youtube|map_|sitemap/i;
  const events = [];
  const all = Object.entries(KANTO_OFFICE_URLS);
  const total = all.reduce((n, [, u]) => n + u.length, 0);
  let visited = 0;
  console.log(`[KantoOffice] 関東 ${total} 事務所ページを巡回開始`);

  const CRAWL_DELAY_MS = 3000; // 連続アクセスによる Cloudflare チャレンジ誘発を避ける
  for (const [pref, urls] of all) {
    const prefCode = pref.slice(0, 2);
    for (const url of urls) {
      visited++;
      if (visited > 1) await sleep(CRAWL_DELAY_MS);
      const $ = await withFreshContext(ctx => fetchPagePlaywright(ctx, url));
      if (!$) continue;

      // 候補チラシ: 将来日付入りファイル名 or イベント系リンク/altテキスト
      const candidates = [];
      $('a[href], img[src]').each((_i, el) => {
        const href = $(el).attr('href') || $(el).attr('src') || '';
        if (!/\.(pdf|jpe?g|png)/i.test(href) || SKIP_ASSET.test(href)) return;
        let abs; try { abs = new URL(href, url).href; } catch { return; }
        const text = (($(el).attr('alt') || '') + ' ' + ($(el).text() || '')).replace(/\s+/g, ' ').trim();
        const m = abs.match(/(?:^|[\/_])R?(\d{1,2})\.(\d{1,2})\.(\d{1,2})/);
        if (m) {
          const mo = parseInt(m[2], 10), dy = parseInt(m[3], 10);
          if (mo >= 1 && mo <= 12 && dy >= 1 && dy <= 31) {
            const ds = `${reiwaToAD(parseInt(m[1], 10))}-${padTwo(mo)}-${padTwo(dy)}`;
            if (!isPast(ds)) candidates.push({ url: abs, text });   // 将来日付チラシ
            return;                                                  // 過去日付チラシはOCRしない
          }
        }
        // 日付なしでもイベント系の PDF はチラシの可能性が高いので対象にする。
        // 画像（PNG/JPG）はカレンダー見出し等のUI装飾が多く誤検出するため除外。
        if (/\.pdf/i.test(abs) && EVENT_KW.test(text)) candidates.push({ url: abs, text });
      });

      if (candidates.length === 0) continue; // ← 高速スキップ

      const uniq = [...new Map(candidates.map(c => [c.url, c])).values()].slice(0, 3);
      for (const c of uniq) {
        const ocr    = await ocrFlyerFull(c.url);
        const parsed = ocr ? parseOcrDate(ocr.date) : null;
        if (!parsed || isPast(parsed.dateStr)) continue;
        const title = (ocr.title && fixOcrTitle(safeStr(ocr.title))) || c.text || '(タイトル不明)';
        events.push({
          id:             `${prefCode}-off-${parsed.dateStr.replace(/-/g, '')}-${titleHash(parsed.dateStr, title)}`,
          pref,
          date:           parsed.dateStr,
          weekday:        parsed.weekday,
          title,
          place:          safeStr(ocr.place) || '',
          address:        '',
          time:           safeStr(ocr.time) || '',
          category:       guessCategory(toHalfWidth(title)),
          tag:            guessTag(title),
          url:            c.url,
          notes:          ocr.notes || null,
          ageRequirement: safeStr(ocr.ageRequirement) || null,
          deadline:       safeStr(ocr.deadline) || null,
          imageUrl:       c.url,
          source_type:    'office_crawl',
        });
        console.log(`[KantoOffice] ✓ ${pref} ${parsed.dateStr} ${title.slice(0, 26)}`);
      }
    }
  }
  console.log(`[KantoOffice] 巡回完了: ${visited}事務所 / 抽出 ${events.length}件`);
  return events;
}

/**
 * 各地本トップページを自動探索し、イベントチラシが掲載されているサブページを発見して
 * PDF/画像をOCRでイベント情報として抽出する。
 *
 * 取得できなかった場合は「公式ページ参照」スタブイベントを生成する。
 * 戻り値: events[] (pref フィールド付き)
 */
async function scrapeOfficeAssets(withFreshContext) {
  if (!await hasAnyOcrEngine()) {
    console.log('[OfficeOCR] 利用可能なOCRエンジンがないためスキップ');
    return { events: [], exploredHqPrefs: new Set() };
  }
  if (!withFreshContext) {
    console.log('[OfficeOCR] Playwright コンテキスト未提供（モックモード）のためスキップ');
    return { events: [], exploredHqPrefs: new Set() };
  }

  // ── offices.json から地本HQ情報とURL→prefマップを構築 ──────────
  let hqEntries    = [];    // { pref, url, name }
  let urlToPref    = {};    // normalizedUrl → pref
  try {
    const officesData = JSON.parse(fs.readFileSync(OFFICES_PATH, 'utf8'));
    for (const o of officesData.offices) {
      if (!o.url) continue;
      const norm = normalizeUrl(o.url);
      if (norm) urlToPref[norm] = o.pref;
      if (o.type === 'hq') hqEntries.push({ pref: o.pref, url: o.url, name: o.name });
    }
  } catch { /* offices.json がなければスキップ */ }

  // ── 既スクレイプURL集合（自動探索の重複除去に使用） ──────────────
  const alreadyScraped = new Set(
    Object.values(URLS).map(u => normalizeUrl(u)).filter(Boolean)
  );

  const todayJST  = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const allEvents = [];
  const exploredPages = new Set(); // このrun内で訪問済み
  const exploredHqPrefs = new Set(); // このrunで実際にHQ探索した地本（前回データ維持の判定用）

  // ── 各地本HQから1レベル自動探索（タイムアウト対策で上限あり） ──────
  const MAX_PAGES_PER_HQ  = 4; // 1地本あたり最大探索ページ数（東京は9件あるため4に拡張）
  const MAX_ASSETS_PER_PAGE = 3; // 1ページあたり最大OCRアセット数
  // 時間上限は HQ_EXPLORE_TIMEOUT_MIN（分）で上書き可能（手動の補完実行用）
  const timeoutMin = Number.parseFloat(process.env.HQ_EXPLORE_TIMEOUT_MIN || '');
  const EXPLORE_TIMEOUT_MS = (Number.isFinite(timeoutMin) ? timeoutMin : 25) * 60 * 1000;
  const exploreStart = Date.now();

  // HQ_EXPLORE_PREFS（カンマ区切りpref）指定時は対象地本を限定（取りこぼしの補完実行用）
  const onlyPrefs = (process.env.HQ_EXPLORE_PREFS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (onlyPrefs.length) {
    hqEntries = hqEntries.filter(h => onlyPrefs.includes(h.pref));
    console.log(`[OfficeOCR] HQ_EXPLORE_PREFS 指定により ${hqEntries.length} 地本に限定: ${hqEntries.map(h => h.pref).join(',')}`);
  } else if (hqEntries.length > 1) {
    // 時間上限内で全地本を回りきれないため、開始位置を実行ごとにローテーションする。
    // 固定順（北→南）だと毎回同じ地点で打ち切られ、西日本のHQが一度も探索されない。
    // GitHub Actions では実行ごとに増える GITHUB_RUN_NUMBER を使い17ずつ進める
    // （17は50と互いに素 → 1日3回で全50地本をカバー。cron遅延でも衝突しない）。
    // ローカル等では8時間窓ベースにフォールバック。
    const runSeq = Number.parseInt(process.env.GITHUB_RUN_NUMBER || '', 10);
    const base   = Number.isFinite(runSeq) ? runSeq : Math.floor(Date.now() / (8 * 3600 * 1000));
    const offset = (base * 17) % hqEntries.length;
    hqEntries = [...hqEntries.slice(offset), ...hqEntries.slice(0, offset)];
    console.log(`[OfficeOCR] HQ探索の開始位置: ${offset}番目（${hqEntries[0].name}）から`);
  }

  for (const hq of hqEntries) {
    if (Date.now() - exploreStart > EXPLORE_TIMEOUT_MS) {
      console.log('[OfficeOCR] 時間上限に達したため探索を中断します');
      break;
    }
    console.log(`[OfficeOCR] 探索: ${hq.name} (${hq.pref}) ${hq.url}`);

    // Playwright ステルスコンテキストで地本トップページを取得
    const $ = await withFreshContext(ctx => fetchPagePlaywright(ctx, hq.url));
    if (!$) { await sleep(BETWEEN_PAGES_MS); continue; }
    exploredHqPrefs.add(hq.pref);

    // イベント系リンクを分類（HTMLページ / PDF・画像の直接リンク）
    const skip                    = new Set([...alreadyScraped, ...exploredPages]);
    const { pages: subPages, assets: directAssets } = findEventLinks($, hq.url, skip);
    console.log(`  サブページ候補: ${subPages.length}件 / 直接アセット: ${directAssets.length}件`);

    await sleep(BETWEEN_PAGES_MS);

    /**
     * アセット群に対してOCRを実行し、日付付きイベントを生成する。
     * @param {Array} assets - sortByPriority 済みアセット配列
     * @param {string} sourceUrl - スタブの url に使うページURL
     * @param {string} pref
     */
    // 全アセットを試してから成否を判断
    async function processAssets(assets, sourceUrl, pref) {
      const prefCode = (pref || 'xx').slice(0, 2);
      let foundAtLeastOne = false;

      for (const asset of assets) {
        const ocr    = await ocrFlyerFull(asset.url);
        await sleep(2000);
        const parsed = ocr ? parseOcrDate(ocr.date) : null;

        if (parsed && !isPast(parsed.dateStr)) {
          const title = (ocr.title && fixOcrTitle(safeStr(ocr.title))) || asset.text || asset.linkText || '(タイトル不明)';
          allEvents.push({
            id:             `${prefCode}-off-${parsed.dateStr.replace(/-/g, '')}-${titleHash(parsed.dateStr, title)}`,
            pref,
            date:           parsed.dateStr,
            weekday:        parsed.weekday,
            title,
            place:          safeStr(ocr.place) || '',
            address:        '',
            time:           safeStr(ocr.time)  || '',
            category:       guessCategory(toHalfWidth(title)),
            tag:            guessTag(title),
            url:            asset.url,
            notes:          ocr.notes || null,
            ageRequirement: safeStr(ocr.ageRequirement) || null,
            deadline:       safeStr(ocr.deadline)       || null,
            source_type:    'office_ocr',
          });
          foundAtLeastOne = true;
          console.log(`    ✓ ${parsed.dateStr} ${title.slice(0, 30)}`);
        }
      }

      // ※ 以前はここで「${hq.name}のイベント情報」等の公式ページ参照スタブ
      //   （source_type: office_notice, date=当日）を生成していたが、廃止した。
      //   偽の開催日（毎回スクレイプ当日）を持つ疑似イベントが「本日開催」と
      //   誤表示され、実イベントと紛らわしいため（2026-07-02 ユーザー報告）。
      //   イベントが取得できない地本は素直に0件とし、公式サイトへの誘導は
      //   UI/静的ページ（県ページの事務所一覧）が担う。
      if (!foundAtLeastOne) {
        console.log(`    - 日付付きイベントなし: ${sourceUrl.split('/').slice(-2).join('/')}`);
      }
    }

    // ── 直接PDF/画像リンクをOCR（上限MAX_ASSETS_PER_PAGE） ────────
    if (directAssets.length > 0) {
      const sorted  = sortByPriority(directAssets);
      const highMed = sorted.filter(a => a.priority !== 'low').slice(0, MAX_ASSETS_PER_PAGE);
      if (highMed.length > 0) {
        const pref = urlToPref[normalizeUrl(hq.url)] || hq.pref;
        console.log(`  直接アセット ${highMed.length}件をOCR中...`);
        await processAssets(highMed, hq.url, pref);
      }
    }

    // ── HTMLサブページを探索してアセット抽出（上限MAX_PAGES_PER_HQ） ─
    let hqPageCount = 0;
    for (const { url: subUrl, text: linkText } of subPages) {
      if (hqPageCount >= MAX_PAGES_PER_HQ) break;
      if (exploredPages.has(subUrl)) continue;
      exploredPages.add(subUrl);
      hqPageCount++;

      const $sub = await withFreshContext(ctx => fetchPagePlaywright(ctx, subUrl));
      if (!$sub) { await sleep(3000); continue; }

      const assets  = sortByPriority(extractAssets($sub, subUrl));
      const highMed = assets.filter(a => a.priority !== 'low').slice(0, MAX_ASSETS_PER_PAGE);
      if (highMed.length === 0) { await sleep(3000); continue; }

      console.log(`  ${subUrl.split('/').slice(-2).join('/')} → 高中アセット ${highMed.length}件`);
      const pref = urlToPref[normalizeUrl(subUrl)] || urlToPref[normalizeUrl(hq.url)] || hq.pref;
      await processAssets(highMed, subUrl, pref);
      await sleep(BETWEEN_PAGES_MS);
    }
    await sleep(BETWEEN_PAGES_MS);
  }

  console.log(`[OfficeOCR] 合計 ${allEvents.length} 件`);
  return { events: allEvents, exploredHqPrefs };
}

// ── メイン処理 ───────────────────────────────────────────────

async function main() {
  const isMock = process.argv.includes('--mock');

  // ── モックモード ──
  if (isMock) {
    console.log('[mock] HTTP アクセスなしでサンプルデータを出力します');
    const output = { ...MOCK_DATA, updatedAt: nowJST() };
    await writeOutput(output);
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
  let officeEvents    = [];
  let hqExploredPrefs = new Set(); // このrunでHQ探索した地本（未探索地本は前回officeイベントを維持）
  let kantoOfficeEvents = [];
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
      hiroshimaEvents = await withFreshContext(ctx => fetchHiroshima(ctx));
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

    // ── 募集案内所ページから PDF/画像 OCR でイベントを収集 ────────
    // browser.close() の前に呼ぶ必要あり（Playwright が必要なため）
    console.log('[wait] 募集案内所探索を開始します...');
    const officeScrape = await scrapeOfficeAssets(withFreshContext);
    officeEvents    = officeScrape.events;
    hqExploredPrefs = officeScrape.exploredHqPrefs;
    try {
      officeEvents = [
        ...officeEvents,
        ...await crawlNationwideOffices(withFreshContext),
      ];
    } catch (err) {
      console.warn(`[OfficeOCR] 全国募集案内所巡回失敗: ${err.message}`);
    }

    // ── 関東 各事務所ページの先回り巡回（中央未掲載イベントの収集）──
    try {
      kantoOfficeEvents = await crawlKantoOffices(withFreshContext);
    } catch (err) {
      console.warn(`[KantoOffice] 巡回失敗: ${err.message}`);
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

  // ── HQ探索ローテーションの補完 ──────────────────────────────
  // HQ探索は時間上限のためローテーション制（1runで全地本は回らない）。
  // 今回HQを探索しなかった地本は、前回の office イベント（office_notice除く）を
  // 維持して「探索された回だけイベントが現れる」ちらつきを防ぐ。
  // 過去日付・不正タイトルは writeOutput の最終フィルタで除外される。
  {
    const officeIds = new Set([...officeEvents, ...kantoOfficeEvents].map(e => e.id));
    let kept = 0;
    for (const [key, arr] of Object.entries(prev)) {
      if (!Array.isArray(arr)) continue;
      if (hqExploredPrefs.has(key)) continue; // 今回探索済み → 最新の巡回結果が正
      for (const e of arr) {
        const st = e.source_type || '';
        if (!st.startsWith('office_') || st === 'office_notice') continue;
        if (!e.date || !e.id || officeIds.has(e.id)) continue;
        officeEvents.push(e);
        officeIds.add(e.id);
        kept++;
      }
    }
    if (kept) console.log(`[OfficeOCR] HQ未探索地本の前回officeイベント ${kept} 件を維持`);
  }

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
  // 大阪: エラー時フォールバック＋準備中（0件）の場合も前回データを保持
  osakaEvents = fallback(osakaError, '大阪', osakaEvents, 'osaka');
  if (!osakaError && osakaEvents.length === 0 && (prev['osaka'] ?? []).length > 0) {
    console.warn('[大阪] イベント0件（準備中）→ 前回データを維持');
    osakaEvents = prev['osaka'] ?? [];
  }
  hyogoEvents     = fallback(hyogoError,     '兵庫',   hyogoEvents,     'hyogo');
  naraEvents      = fallback(naraError,      '奈良',   naraEvents,      'nara');
  wakayamaEvents  = fallback(wakayamaError,  '和歌山', wakayamaEvents,  'wakayama');

  // ── 近畿WP系地本 + 京都: チラシ（PDF/画像）から日付・タイトルを OCR で補完 ──
  // OCR全件失敗時は前回データを保持する（クォータ枯渇対策）
  const enrichWithFallback = async (events, label, prevKey) => {
    const hadStubs = events.some(e => e._flyerUrl);
    const enriched = await enrichFromFlyer(events, label);
    if (hadStubs && enriched.length === 0 && (prev[prevKey] ?? []).length > 0) {
      console.warn(`[${label}] OCR全件失敗 → 前回データを維持 (${(prev[prevKey] ?? []).length}件)`);
      return prev[prevKey] ?? [];
    }
    return enriched;
  };

  kyotoEvents    = await enrichWithFallback(kyotoEvents,    '京都',  'kyoto');
  mieEvents      = await enrichWithFallback(mieEvents,      '三重',  'mie');
  shigaEvents    = await enrichWithFallback(shigaEvents,    '滋賀',  'shiga');
  naraEvents     = await enrichWithFallback(naraEvents,     '奈良',  'nara');
  wakayamaEvents = await enrichWithFallback(wakayamaEvents, '和歌山','wakayama');
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

  // officeEvents は try ブロック内（browser.close前）で収集済み

  // imageUrl は最終出力に含めない（内部用フィールド）
  const strip = ev => {
    const { imageUrl: _, _flyerUrl: __, duplicate_candidate: _d, duplicate_of: _do, ...rest } = ev;
    rest.title = finalizeTitle(rest.title, rest.source_type); // 収集後にタイトルを整形
    return rest;
  };

  // 関東の先回り巡回で得た事務所イベントを、中央ページの既存イベントへ統合する。
  // 中央ページと事務所ページで同一イベントが重複しないよう、id だけでなく
  // 「日付＋タイトル先頭」「日付＋場所先頭」でも重複判定して除外する。
  function mergeKantoOfficeEvents(existing, pref) {
    const crawled = kantoOfficeEvents.filter(e => e.pref === pref);
    if (!crawled.length) return existing;
    const norm = s => (s || '').replace(/\s+/g, '').replace(/[（(].*?[）)]/g, '');
    const ids   = new Set(existing.map(e => e.id));
    const tKeys = new Set(existing.map(e => `${e.date}|${norm(e.title).slice(0, 8)}`));
    const pKeys = new Set(existing.filter(e => e.place).map(e => `${e.date}|${norm(e.place).slice(0, 8)}`));
    const add = crawled.filter(e => {
      if (ids.has(e.id)) return false;
      if (tKeys.has(`${e.date}|${norm(e.title).slice(0, 8)}`)) return false;
      if (e.place && pKeys.has(`${e.date}|${norm(e.place).slice(0, 8)}`)) return false;
      return true;
    });
    if (!add.length) return existing;
    console.log(`[${pref}] 事務所巡回から ${add.length}件を追加`);
    return markDuplicates([...existing, ...add]);
  }

  // 都道府県ごとのイベントに事務所スクレイプ結果をマージ（重複除去込み）
  function mergeOfficeEvents(existing, pref) {
    const fromOffice = officeEvents.filter(e => e.pref === pref);
    if (!fromOffice.length) return existing;
    const allIds = new Set(existing.map(e => e.id));
    const norm = s => (s || '').replace(/\s+/g, '').replace(/[（(].*?[）)]/g, '');
    const tKeys = new Set(existing.map(e => `${e.date}|${norm(e.title).slice(0, 8)}`));
    const pKeys = new Set(existing.filter(e => e.place).map(e => `${e.date}|${norm(e.place).slice(0, 8)}`));
    const deduped = fromOffice.filter(e => {
      if (allIds.has(e.id)) return false;
      // 既存イベントがある地本にはスタブを追加しない（通知ノイズ防止）
      if (e.source_type === 'office_notice' && existing.length > 0) return false;
      if (tKeys.has(`${e.date}|${norm(e.title).slice(0, 8)}`)) return false;
      if (e.place && pKeys.has(`${e.date}|${norm(e.place).slice(0, 8)}`)) return false;
      return true;
    });
    if (!deduped.length) return existing;
    return markDuplicates([...existing, ...deduped]);
  }

  function mergeAllOfficeEvents(existing, pref) {
    const withKanto = KANTO_PREFS.has(pref) ? mergeKantoOfficeEvents(existing, pref) : existing;
    return mergeOfficeEvents(withKanto, pref);
  }

  const output = {
    sapporo:   mergeAllOfficeEvents(sapporoEvents,   'sapporo').map(strip),
    asahikawa: mergeAllOfficeEvents(asahikawaEvents, 'asahikawa').map(strip),
    obihiro:   mergeAllOfficeEvents(obihiroEvents,   'obihiro').map(strip),
    hakodate:  mergeAllOfficeEvents(hakodateEvents,  'hakodate').map(strip),
    miyagi:    mergeAllOfficeEvents(miyagiEvents,    'miyagi').map(strip),
    aomori:    mergeAllOfficeEvents(aomoriEvents,    'aomori').map(strip),
    iwate:     mergeAllOfficeEvents(iwateEvents,     'iwate').map(strip),
    yamagata:  mergeAllOfficeEvents(yamagataEvents,  'yamagata').map(strip),
    fukushima: mergeAllOfficeEvents(fukushimaEvents, 'fukushima').map(strip),
    akita:     mergeAllOfficeEvents(akitaEvents,     'akita').map(strip),
    kanagawa:  mergeAllOfficeEvents(kanagawaEvents,  'kanagawa').map(strip),
    tokyo:     mergeAllOfficeEvents(tokyoEvents,     'tokyo').map(strip),
    saitama:   mergeAllOfficeEvents(saitamaEvents,   'saitama').map(strip),
    gunma:     mergeAllOfficeEvents(gunmaEvents,     'gunma').map(strip),
    tochigi:   mergeAllOfficeEvents(tochigiEvents,   'tochigi').map(strip),
    ibaraki:   mergeAllOfficeEvents(ibarakiEvents,   'ibaraki').map(strip),
    chiba:     mergeAllOfficeEvents(chibaEvents,     'chiba').map(strip),
    niigata:   mergeAllOfficeEvents(niigataEvents,   'niigata').map(strip),
    toyama:    mergeAllOfficeEvents(toyamaEvents,    'toyama').map(strip),
    ishikawa:  mergeAllOfficeEvents(ishikawaEvents,  'ishikawa').map(strip),
    fukui:     mergeAllOfficeEvents(fukuiEvents,     'fukui').map(strip),
    yamanashi: mergeAllOfficeEvents(yamanashiEvents, 'yamanashi').map(strip),
    nagano:    mergeAllOfficeEvents(naganoEvents,    'nagano').map(strip),
    gifu:      mergeAllOfficeEvents(gifuEvents,      'gifu').map(strip),
    shizuoka:  mergeAllOfficeEvents(shizuokaEvents,  'shizuoka').map(strip),
    aichi:     mergeAllOfficeEvents(aichiEvents,     'aichi').map(strip),
    mie:       mergeAllOfficeEvents(mieEvents,       'mie').map(strip),
    shiga:     mergeAllOfficeEvents(shigaEvents,     'shiga').map(strip),
    kyoto:     mergeAllOfficeEvents(kyotoEvents,     'kyoto').map(strip),
    osaka:     mergeAllOfficeEvents(osakaEvents,     'osaka').map(strip),
    hyogo:     mergeAllOfficeEvents(hyogoEvents,     'hyogo').map(strip),
    nara:      mergeAllOfficeEvents(naraEvents,      'nara').map(strip),
    wakayama:  mergeAllOfficeEvents(wakayamaEvents,  'wakayama').map(strip),
    ehime:     mergeAllOfficeEvents(ehimeEvents,     'ehime').map(strip),
    kagawa:    mergeAllOfficeEvents(kagawaEvents,    'kagawa').map(strip),
    kochi:     mergeAllOfficeEvents(kochiEvents,     'kochi').map(strip),
    tokushima: mergeAllOfficeEvents(tokushimaEvents, 'tokushima').map(strip),
    tottori:   mergeAllOfficeEvents(tottoriEvents,   'tottori').map(strip),
    shimane:   mergeAllOfficeEvents(shimaneEvents,   'shimane').map(strip),
    okayama:   mergeAllOfficeEvents(okayamaEvents,   'okayama').map(strip),
    hiroshima: mergeAllOfficeEvents(hiroshimaEvents, 'hiroshima').map(strip),
    yamaguchi: mergeAllOfficeEvents(yamaguchiEvents, 'yamaguchi').map(strip),
    fukuoka:   mergeAllOfficeEvents(fukuokaEvents,   'fukuoka').map(strip),
    saga:      mergeAllOfficeEvents(sagaEvents,      'saga').map(strip),
    nagasaki:  mergeAllOfficeEvents(nagasakiEvents,  'nagasaki').map(strip),
    kumamoto:  mergeAllOfficeEvents(kumamotoEvents,  'kumamoto').map(strip),
    oita:      mergeAllOfficeEvents(oitaEvents,      'oita').map(strip),
    miyazaki:  mergeAllOfficeEvents(miyazakiEvents,  'miyazaki').map(strip),
    kagoshima: mergeAllOfficeEvents(kagoshimaEvents, 'kagoshima').map(strip),
    okinawa:   mergeAllOfficeEvents(okinawaEvents,   'okinawa').map(strip),
    updatedAt: nowJST(),
  };
  // OCRキャッシュを保存（スキャン済みURLを記録 → 次回以降の再スキャンを防ぐ）
  assetCache.save();
  // OCR層の稼働状況を書き出す（ワークフローの健全性チェックが読む）
  writeOcrStats();

  await writeOutput(output);
  // 新規イベントを検出してプッシュ通知（非同期・失敗しても続行）
  await notifyNewEvents(prev, output).catch(err =>
    console.warn('[Push] notifyNewEvents エラー:', err.message)
  );
}

/** public/data/events.json に書き出す */
async function writeOutput(data) {
  // ディレクトリが無ければ作成
  const dir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // 終了したイベントは「終了済み」として1週間（ENDED_KEEP_DAYS）残し、それ以前のみ削除。
  // フロント側でも同じ閾値で「終了済み」タグを付けて表示する。
  const ENDED_KEEP_DAYS = 7;
  const jstNow = new Date(Date.now() + 9 * 3600 * 1000);
  const today = jstNow.toISOString().slice(0, 10); // "YYYY-MM-DD"
  const cutoff = new Date(jstNow.getTime() - ENDED_KEEP_DAYS * 86400000).toISOString().slice(0, 10);
  let removedCount = 0;
  const quarantined = []; // 「疑わしい」タイトルで公開を保留したイベント（管理者レビュー用）
  // ★ ここが全イベントカードの最終整形・検証ゲート。各フィールドの書式・記述ルールの
  //    正準は CLAUDE.md「イベントカード記述ルール（正準仕様）」。実装は shared/titleQuality.cjs
  //    （+ 募集案内所は shared/officeTitle.cjs、カテゴリ/タグ/曜日は parsers/utils.js）。
  //    新経路を足すときも必ずこのゲート（titleQuality 適用後）を通すこと。
  for (const key of Object.keys(data)) {
    if (!Array.isArray(data[key])) continue;
    const before = data[key].length;
    // チラシ照合済みの修正を適用 → 先頭・末尾のゴミと場所欄を整形してから検査
    data[key] = data[key].map(ev => {
      const fixed = applyVerifiedOverrides(ev);
      // place に住所が連結していれば address 側へ分離（会場名の表示を綺麗にし、
      // かつ address を埋めて天気ジオコーディングの精度を上げる）
      const { place, address } = splitPlaceAddress(cleanPlaceText(fixed.place), fixed.address);
      return {
        ...fixed,
        title:    cleanEventTitle(fixed.title),
        place,
        address:  address || fixed.address || '',
        time:     cleanTimeText(fixed.time),
        deadline: cleanDeadlineText(fixed.deadline) || null,
      };
    });
    data[key] = data[key].filter(ev => {
      if (!ev.date) return false;
      if ((ev.endDate || ev.date) < cutoff) return false; // 終了から1週間を過ぎたものだけ削除
      // タイトルが「お知らせ」のみ等、内容のないゴミデータを除外
      if (!ev.title || /^お知らせ$/.test(ev.title.trim())) return false;
      // OCR残骸・申し込み案内・住所混入・中身なしスタブを除外（全経路の最終防御）
      if (isJunkOrStubTitle(ev.title)) return false;
      // 過去年のイベントが現在年の日付で再登録されたもの（年ズレ）を除外
      if (isStaleDatedEvent(ev)) return false;
      // 検疫: 新種のゴミの可能性が高い「疑わしい」タイトルは公開せず隔離。
      // 正規イベントと確認できたら titleQuality の APPROVED_TITLES へ追加すると公開される。
      if (isSuspiciousTitle(ev.title)) { quarantined.push(ev); return false; }
      return true;
    });
    // 同一（日付×名称×場所）の重複を統合。場所違いの同名イベントは残る
    data[key] = dedupEvents(data[key]);
    // 「公式確認」スタブ（office_notice）は常時除外（2026-07-02 生成自体を廃止。
    // 偽の開催日を持つ疑似イベントのため、前回データ維持や旧コミットの定期実行から
    // 混入しても必ずここで落とす）
    data[key] = data[key].filter(e => e.source_type !== 'office_notice');
    removedCount += before - data[key].length;
    // 曜日をカレンダーデータで上書き
    data[key].forEach(ev => {
      if (ev.date)    ev.weekday    = calcWeekday(ev.date);
      if (ev.endDate) ev.endWeekday = calcWeekday(ev.endDate);
    });
  }
  if (removedCount > 0) console.log(`[フィルタ] 過去イベント ${removedCount} 件を削除`);

  // ── 検疫ファイルの書き出し（毎回、今回の疑わしい件で全置換） ──────────
  // ルール追加・APPROVED_TITLES 登録で解消した項目は次回から自動的に消える。
  // CI（scrape.yml）がこのファイルを読んで管理者へ ntfy 通知する。
  try {
    const qEvents = quarantined.map(e => ({
      id: e.id, pref: e.pref, date: e.date, endDate: e.endDate || '',
      title: e.title || '', place: e.place || '', url: e.url || '',
      source_type: e.source_type || '', quarantinedAt: today,
    }));
    fs.writeFileSync(QUARANTINE_PATH, JSON.stringify({ updatedAt: today, count: qEvents.length, events: qEvents }, null, 2), 'utf8');
    if (qEvents.length > 0) {
      console.log(`[検疫] 疑わしいタイトル ${qEvents.length} 件を公開保留にしました:`);
      qEvents.forEach(e => console.log(`  - [${e.pref}] ${e.date} ${e.title}`));
    }
  } catch (e) { console.warn('[検疫] 書き出しに失敗:', e.message); }

  // ── 受付終了/中止の状態・締切日を付与（誤判定防止つき） ─────────────
  // タイトル・備考の文言と締切日から status(closed/cancelled)・deadlineDate を導出する。
  // published（通常）は状態フィールドを付けない＝後方互換＆データ量を抑える。
  // 前回 events.json の status を読み、cancelled/closed の粘着性を維持（文言消失で復活させない）。
  const prevStatusById = new Map();
  // 初回掲載日（firstSeen）。構造化データ（JSON-LD）の offers.validFrom に使うため、
  // 一度付いた日付は前回 events.json から引き継いで変化させない。
  const prevFirstSeenById = new Map();
  try {
    if (fs.existsSync(OUTPUT_PATH)) {
      const prev = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
      for (const k of Object.keys(prev)) {
        if (!Array.isArray(prev[k])) continue;
        for (const e of prev[k]) {
          if (!e || !e.id) continue;
          if (e.status) prevStatusById.set(e.id, e.status);
          if (/^\d{4}-\d{2}-\d{2}$/.test(String(e.firstSeen ?? ''))) prevFirstSeenById.set(e.id, e.firstSeen);
        }
      }
    }
  } catch (e) { console.warn('[status] 前回 events.json の読み込みに失敗:', e.message); }

  let closedCount = 0, cancelledCount = 0, deadlineDateCount = 0, lowConfCount = 0;
  const statusSourceOf = (ev) => {
    const s = String(ev.source_type || '');
    if (s.startsWith('office_ocr')) return 'ocr';
    if (s === 'tokyo_calendar' || s === 'calendar') return 'calendar';
    if (s.startsWith('office')) return 'html';
    return 'html';
  };
  for (const key of Object.keys(data)) {
    if (!Array.isArray(data[key])) continue;
    for (const ev of data[key]) {
      // 初回掲載日: 既知なら維持、初出なら今日。以後この値は変わらない。
      ev.firstSeen = prevFirstSeenById.get(ev.id)
        || (/^\d{4}-\d{2}-\d{2}$/.test(String(ev.firstSeen ?? '')) ? ev.firstSeen : today);
      const text = [ev.title, ev.notes, ev.place].filter(Boolean).join('\n');
      const derived = eventStatus.deriveStatus({
        text, deadline: ev.deadline || '', eventDate: ev.date || '', endDate: ev.endDate || '', today,
      });
      // 機械判定可能な締切日（原文 deadline は保持）
      if (derived.deadlineDate) { ev.deadlineDate = derived.deadlineDate; deadlineDateCount++; }
      // 前回状態との統合（cancelled/closed は復活させない）
      const merged = eventStatus.mergeStatus(prevStatusById.get(ev.id) || '', derived);
      if (merged.status === 'closed' || merged.status === 'cancelled') {
        ev.status = merged.status;
        ev.statusReason = merged.statusReason || derived.statusReason || '';
        ev.statusSource = merged.sticky ? (prevStatusById.get(ev.id) ? 'previous' : statusSourceOf(ev)) : statusSourceOf(ev);
        ev.statusUpdatedAt = today;
        if (merged.status === 'closed') closedCount++; else cancelledCount++;
        if (derived.confidence === 'low') lowConfCount++;
      }
    }
  }
  console.log(`[status] closed:${closedCount} cancelled:${cancelledCount} deadlineDate:${deadlineDateCount}${lowConfCount ? ` (低信頼:${lowConfCount})` : ''}`);

  // 全県横断でイベントIDの重複（ハッシュ衝突）を一意化（お気に入りの誤連動防止・CI品質ゲート対応）
  try {
    const { uniquifyIds } = require('../shared/dataQuality.cjs');
    const n = uniquifyIds(data);
    if (n > 0) console.log(`[ID] 重複IDを ${n} 件一意化しました`);
  } catch (e) { console.warn('[ID] 一意化に失敗:', e.message); }

  // 開催場所 → 緯度経度（天気予報用）。整形・重複統合後の最終 place/address を使う。
  // 結果は geocode-cache.json にキャッシュし、同一会場の再検索を避ける。失敗しても続行。
  try {
    await geocode.geocodeAll(data, today);
  } catch (e) {
    console.warn('[geocode] ジオコーディングに失敗しました:', e.message);
  }

  // ── 過去イベントのアーカイブ（終了したイベントを恒久保存） ──────────
  // 候補は「前回 events.json の過去イベント」＋「今回の出力に残る終了済みイベント」。
  //   - 前回分: この時点で OUTPUT_PATH はまだ前回の内容（上書き前）。掲載元が終了直後に
  //     イベントを削除しても、前回ファイルに居た時点の姿で必ず退避される（取りこぼし防止）。
  //   - 今回分: status 導出後なので受付終了/中止も反映される。同一IDは今回分（後着）が優先。
  // upsert のため毎回実行しても冪等。失敗しても本処理（events.json 出力）は妨げない。
  try {
    const candidates = [];
    const isPastEv = (e) => e && e.id && e.date && (e.endDate || e.date) < today;
    try {
      if (fs.existsSync(OUTPUT_PATH)) {
        const prevOut = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
        for (const k of Object.keys(prevOut)) {
          if (!Array.isArray(prevOut[k])) continue;
          for (const e of prevOut[k]) if (isPastEv(e)) candidates.push(e);
        }
      }
    } catch (e) { console.warn('[アーカイブ] 前回 events.json 読み込み失敗:', e.message); }
    for (const k of Object.keys(data)) {
      if (!Array.isArray(data[k])) continue;
      for (const e of data[k]) if (isPastEv(e)) candidates.push(e);
    }
    archivePastEvents(candidates, today);
  } catch (e) { console.warn('[アーカイブ] 退避に失敗:', e.message); }

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

/**
 * 終了したイベント（候補=前回 events.json＋今回出力の過去イベント）を恒久アーカイブへ退避する。
 * - 保存先 public/data/events-archive.json（git コミット。運営「過去イベント」が閲覧）。
 * - id で upsert（再退避は最新で上書き＝毎回実行しても冪等）。
 * - 品質防御: 不正タイトル・office_notice スタブは持ち込まない。
 * - 保持: 開催日が ARCHIVE_RETENTION_DAYS 以内、かつ最大 ARCHIVE_MAX 件（新しい順）。
 * - 天気座標など表示に不要な大きいフィールドは載せない（サイズ抑制）。
 */
function archivePastEvents(candidates, today) {
  if (!Array.isArray(candidates) || candidates.length === 0) return;

  let archive = { updatedAt: '', events: [] };
  try {
    if (fs.existsSync(ARCHIVE_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(ARCHIVE_PATH, 'utf8'));
      if (parsed && Array.isArray(parsed.events)) archive = parsed;
    }
  } catch (e) { console.warn('[アーカイブ] 既存読み込み失敗（新規作成）:', e.message); }

  // 保存する項目（運営一覧に必要な最小限。weatherLocation 等は除外）
  const pick = (e) => ({
    id: e.id, pref: e.pref, office: e.office || '',
    date: e.date, endDate: e.endDate || '',
    title: e.title || '', place: e.place || '', url: e.url || '',
    category: e.category || '', status: e.status || '',
    source_type: e.source_type || '', archivedAt: today,
  });

  const byId = new Map(archive.events.map(e => [e.id, e]));
  let added = 0;
  for (const e of candidates) {
    // 品質防御は shared/titleQuality の isArchivableEvent に一本化
    // （不正タイトル・office_notice スタブ・検疫対象＝疑わしいタイトルを過去ログへ持ち込まない）
    if (!isArchivableEvent(e)) continue;
    if (!byId.has(e.id)) added++;
    byId.set(e.id, pick(e)); // 再退避時は最新で上書き
  }

  // 保持: 開催日(実効日)が RETENTION_DAYS 以内のみ。新しい順に上限件数。
  const minDate = new Date(Date.now() + 9 * 3600 * 1000 - ARCHIVE_RETENTION_DAYS * 86400000)
    .toISOString().slice(0, 10);
  const eff = (e) => e.endDate || e.date || '';
  let events = [...byId.values()].filter(e => eff(e) >= minDate);
  events.sort((a, b) => (eff(a) < eff(b) ? 1 : eff(a) > eff(b) ? -1 : 0)); // 新しい順
  if (events.length > ARCHIVE_MAX) events = events.slice(0, ARCHIVE_MAX);

  fs.writeFileSync(ARCHIVE_PATH, JSON.stringify({ updatedAt: today, events }, null, 2), 'utf8');
  console.log(`[アーカイブ] 過去イベント退避: 新規 ${added} 件 / 保持 ${events.length} 件 → ${ARCHIVE_PATH}`);
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

  // ここでは送信せず、ペイロードをファイルへ書き出すだけにする。
  // 実送信は scrape.yml が commit → push → Vercel デプロイ → CDN 伝播待機の
  // 「後」に行う（デプロイ前に通知が届くと、タップ時に旧データが表示される
  // 問題の解消。Issue #16）。毎回全置換のため前回の残骸が誤送信されることはない。
  if (newEvents.length === 0) {
    fs.writeFileSync(PUSH_PAYLOAD_PATH, JSON.stringify({ count: 0 }), 'utf8');
    console.log('[Push] 新規イベントなし。ペイロードは空で書き出し');
    return;
  }
  const sample = newEvents.slice(0, 3);
  const payload = {
    count: newEvents.length,
    title: `自衛隊イベント情報 +${newEvents.length}件`,
    body:  sample.map(e => `・${e.title} (${e.date})`).join('\n')
         + (newEvents.length > 3 ? `\n他 ${newEvents.length - 3} 件…` : ''),
    url:   '/',
  };
  fs.writeFileSync(PUSH_PAYLOAD_PATH, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`[Push] 新規イベント ${newEvents.length} 件のペイロードを書き出し（送信はデプロイ後に workflow が実施）`);
}


// ── エントリーポイント ────────────────────────────────────────
main().catch(err => {
  console.error('[致命的エラー]', err);
  process.exit(1);
});
