#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { hashHtml, classifyChange } = require('./lib/sourceMonitor');
const { decodeHtml } = require('./lib/officePageSnapshot');

const ROOT = path.join(__dirname, '..');
const OFFICES_PATH = path.join(ROOT, 'public/data/offices.json');
const INDEX_PATH = path.join(__dirname, 'index.js');
const STATE_PATH = process.env.SOURCE_UPDATE_STATE_PATH || path.join(__dirname, 'source-update-state.json');
const REPORT_PATH = process.env.SOURCE_UPDATE_REPORT_PATH || path.join(__dirname, 'source-update-report.json');

const TIMEOUT_MS = positiveInt(process.env.SOURCE_MONITOR_TIMEOUT_MS, 15_000);
const REQUEST_GAP_MS = positiveInt(process.env.SOURCE_MONITOR_REQUEST_GAP_MS, 3_000);
const CONCURRENCY = positiveInt(process.env.SOURCE_MONITOR_CONCURRENCY, 1);
const MAX_PAGES = nonNegativeInt(process.env.SOURCE_MONITOR_MAX_PAGES, 0);

const blockedHosts = new Set();
const hostFailures = new Map();
let lastRequestStartedAt = 0;

function positiveInt(value, fallback) {
  const n = Number.parseInt(value || '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function nonNegativeInt(value, fallback) {
  const n = Number.parseInt(value || '', 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRequestSlot() {
  const waitMs = Math.max(0, lastRequestStartedAt + REQUEST_GAP_MS - Date.now());
  if (waitMs > 0) await sleep(waitMs);
  lastRequestStartedAt = Date.now();
}

function hostOf(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

function noteHostFailure(host, hardBlock = false) {
  if (!host) return;
  const count = (hostFailures.get(host) || 0) + 1;
  hostFailures.set(host, count);
  if (hardBlock || count >= 3) {
    blockedHosts.add(host);
    console.warn(`[SourceMonitor] ${host} はこの実行中の巡回を停止します（failures=${count}）`);
  }
}

function noteHostSuccess(host) {
  if (host) hostFailures.set(host, 0);
}

function normalizePageUrl(raw) {
  try {
    const u = new URL(raw);
    if (!/^https?:$/.test(u.protocol)) return null;
    u.hash = '';
    return u.href;
  } catch {
    return null;
  }
}

function addSource(map, rawUrl, meta) {
  const key = normalizePageUrl(rawUrl);
  if (!key) return;
  // HTMLページ監視が目的。iCalendar等は既存スクレイパーの定期取得に任せる。
  if (/\.ics(?:$|[?#])/i.test(key)) return;

  const current = map.get(key) || {
    url: rawUrl,
    normalizedUrl: key,
    prefs: new Set(),
    names: new Set(),
    kinds: new Set(),
  };
  if (meta.pref) current.prefs.add(meta.pref);
  if (meta.name) current.names.add(meta.name);
  if (meta.kind) current.kinds.add(meta.kind);
  map.set(key, current);
}

function urlsFromScraperIndex() {
  const source = fs.readFileSync(INDEX_PATH, 'utf8');
  const block = source.match(/const URLS = \{([\s\S]*?)\n\};/);
  if (!block) return [];

  const urls = [];
  const re = /['"](https?:\/\/[^'"]+)['"]/g;
  let match;
  while ((match = re.exec(block[1])) !== null) urls.push(match[1]);
  return urls;
}

function loadSources() {
  const map = new Map();
  const offices = JSON.parse(fs.readFileSync(OFFICES_PATH, 'utf8'));

  for (const office of offices.offices || []) {
    if (!office.url) continue;
    addSource(map, office.url, {
      pref: office.pref,
      name: office.name,
      kind: office.type === 'hq' ? 'hq' : 'office',
    });
  }

  // 全国窓口巡回と同じ設定を読む。連絡先URLだけでは専用イベントページを網羅できない。
  const configured = require('./config/office-event-sources.json');
  for (const office of configured.offices || []) {
    for (const url of [office.contactUrl, ...(office.pages || []).map(page => page.url)]) {
      addSource(map, url, { pref: office.pref, name: office.name, kind: 'office-event-source' });
    }
  }

  // 地本トップだけでなく、既存スクレイパーが直接読むイベント専用ページも監視する。
  // index.js の URLS から抽出するため、今後URLが追加されても監視側の二重管理を避けられる。
  for (const url of urlsFromScraperIndex()) {
    addSource(map, url, {
      name: '既存スクレイパー取得元',
      kind: 'scrape-source',
    });
  }

  let sources = [...map.values()].map((source) => ({
    ...source,
    prefs: [...source.prefs].sort(),
    names: [...source.names].sort(),
    kinds: [...source.kinds].sort(),
  }));
  sources.sort((a, b) => a.normalizedUrl.localeCompare(b.normalizedUrl));
  if (MAX_PAGES > 0) sources = sources.slice(0, MAX_PAGES);
  return sources;
}

function loadState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    if (parsed && parsed.pages && typeof parsed.pages === 'object') return parsed;
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`[SourceMonitor] 状態ファイルを読めません: ${err.message}`);
    }
  }
  return { version: 1, pages: {} };
}

async function takeSnapshot(context, source) {
  const page = await context.newPage();
  try {
    // 相手サイトへの瞬間負荷を抑えるため、全URLで開始間隔を必ず空ける。
    await waitForRequestSlot();
    const response = await page.goto(source.url, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUT_MS,
    });

    const status = response ? response.status() : 0;
    // 404/410 はページ廃止という有効な変更。
    // 403/429 はアクセス抑制の意思表示とみなし、同一ホストをこの実行中は以後巡回しない。
    if (status === 403 || status === 429) {
      const err = new Error(`HTTP ${status}`);
      err.hardBlock = true;
      throw err;
    }
    if (status >= 500) throw new Error(`HTTP ${status}`);

    const headers = response ? await response.allHeaders() : {};
    let html;
    try { html = await page.content(); }
    catch (error) {
      if (!response?.body) throw error;
      // ナビゲーション競合時は受信済みHTMLを利用し、再リクエストしない。
      html = decodeHtml(await response.body(), headers);
    }
    if (!html || html.length < 40) throw new Error('HTMLが空です');

    return {
      hash: hashHtml(html),
      status,
      finalUrl: response?.url?.() || page.url(),
      etag: headers.etag || null,
      lastModified: headers['last-modified'] || null,
      contentLength: html.length,
    };
  } finally {
    await page.close().catch(() => {});
  }
}

async function main() {
  const { chromium } = require('playwright');
  const sources = loadSources();
  if (!sources.length) throw new Error('監視対象URLが0件です');

  const previous = loadState();
  const now = new Date().toISOString();
  const next = {
    version: 1,
    updatedAt: now,
    pages: { ...(previous.pages || {}) },
  };
  const changed = [];
  const failures = [];
  let baseline = 0;
  let unchanged = 0;
  let cursor = 0;

  console.log(`[SourceMonitor] ${sources.length} URLを確認（並列 ${CONCURRENCY}）`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({
    locale: 'ja-JP',
    javaScriptEnabled: false,
    userAgent: 'Mozilla/5.0 (compatible; jsdf-chiiki-events source monitor; +https://github.com/naoya7928-0813/jsdf-chiiki-events)',
  });

  // 更新監視に必要なのはHTML文書だけ。
  // JavaScript・CSS・画像・フォント・XHR等のサブリソースは取得しない。
  // a[href] / img[src] はHTML自体に残るため、チラシURL変更の検知は可能。
  await context.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') {
      await route.abort();
      return;
    }
    await route.continue();
  });

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= sources.length) return;
      const source = sources[index];
      const key = source.normalizedUrl;
      const host = hostOf(source.url);

      if (host && blockedHosts.has(host)) {
        failures.push({
          url: source.url,
          prefs: source.prefs,
          names: source.names,
          error: '同一ホストの保護停止により未取得',
          skipped: true,
        });
        continue;
      }

      try {
        const snapshot = await takeSnapshot(context, source);
        noteHostSuccess(host);
        const prior = previous.pages?.[key] || null;
        const state = classifyChange(prior, snapshot);

        if (state === 'changed') {
          changed.push({
            url: source.url,
            prefs: source.prefs,
            names: source.names,
            kinds: source.kinds,
            previousStatus: prior?.status ?? null,
            status: snapshot.status,
            previousHash: prior?.hash || null,
            hash: snapshot.hash,
          });
          console.log(`[SourceMonitor] UPDATED ${source.url}`);
        } else if (state === 'baseline') {
          baseline += 1;
        } else {
          unchanged += 1;
        }

        next.pages[key] = {
          ...snapshot,
          url: source.url,
          prefs: source.prefs,
          names: source.names,
          kinds: source.kinds,
          checkedAt: now,
          changedAt: state === 'changed' ? now : (prior?.changedAt || null),
        };
      } catch (err) {
        noteHostFailure(host, err.hardBlock === true);
        failures.push({
          url: source.url,
          prefs: source.prefs,
          names: source.names,
          error: err.message,
          skipped: false,
        });
        console.warn(`[SourceMonitor] FAIL ${source.url} -> ${err.message}`);
        // 失敗したURLは前回状態を保持し、一時障害を「更新」と誤認しない。
        // 403/429 は即時、その他の失敗も同一ホストで3回続いたら以後を停止する。
      }
    }
  }

  try {
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, sources.length) }, () => worker())
    );
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  const report = {
    checkedAt: now,
    total: sources.length,
    checked: sources.length - failures.length,
    changed: changed.length,
    baseline,
    unchanged,
    failed: failures.length,
    shouldScrape: changed.length > 0,
    changes: changed,
    failures,
  };

  fs.writeFileSync(STATE_PATH, JSON.stringify(next, null, 2) + '\n');
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');

  console.log(
    `[SourceMonitor] 完了: changed=${report.changed} baseline=${baseline} unchanged=${unchanged} failed=${report.failed}`
  );

  if (report.checked === 0) {
    throw new Error('全監視対象の取得に失敗しました');
  }
}

module.exports = { loadSources, takeSnapshot };

if (require.main === module) main().catch((err) => {
  console.error('[SourceMonitor] fatal:', err);
  process.exitCode = 1;
});
