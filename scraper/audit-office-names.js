'use strict';

const fs = require('fs');
const cheerio = require('cheerio');

const OFFICES_PATH = '../public/data/offices.json';
const HUB_URL = 'https://www.mod.go.jp/gsdf/jieikanbosyu/contact/chihon/';
const DELAY_MS = 1800;

const PREF_ALIASES = {
  sizuoka: 'shizuoka',
};

const SUFFIX_RE = /(地域事務所|募集案内所|出張所|分駐所|駐在員事務所|地区隊)$/;
const CANDIDATE_RE = /([一-龯々〆ヶぁ-んァ-ヶA-Za-z0-9０-９（）()・ー\-]{1,24}(?:地域事務所|募集案内所|出張所|分駐所|駐在員事務所|地区隊))/g;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = s => String(s || '')
  .replace(/[\s　]+/g, '')
  .replace(/[（）]/g, m => m === '（' ? '(' : ')')
  .trim();

async function fetchOnce(url) {
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; jsdf-chiiki-events office-name-audit; +https://github.com/naoya7928-0813/jsdf-chiiki-events)',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'ja-JP,ja;q=0.9',
    },
  });
  const body = await res.text();
  return { status: res.status, body, finalUrl: res.url };
}

function pcoSlug(url) {
  const m = String(url).match(/\/pco\/([^/]+)\//i);
  if (!m) return null;
  return PREF_ALIASES[m[1].toLowerCase()] || m[1].toLowerCase();
}

function extractOfficeNames(html) {
  const $ = cheerio.load(html);
  const set = new Set();
  $('h1,h2,h3,h4,h5,h6,a,li,dt,dd,th,td,strong,b').each((_i, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (!text || text.length > 100) return;
    for (const m of text.matchAll(CANDIDATE_RE)) {
      const name = m[1].trim();
      if (name.length <= 35 && SUFFIX_RE.test(name)) set.add(name);
    }
  });
  return [...set];
}

(async () => {
  const data = JSON.parse(fs.readFileSync(OFFICES_PATH, 'utf8'));
  const current = new Map();
  for (const o of data.offices || []) {
    if (o.type !== 'recruitment') continue;
    if (!current.has(o.pref)) current.set(o.pref, []);
    current.get(o.pref).push(o.name);
  }

  const hub = await fetchOnce(HUB_URL);
  if (hub.status !== 200) throw new Error(`central hub HTTP ${hub.status}`);
  const $hub = cheerio.load(hub.body);
  const targets = new Map();
  $hub('a[href]').each((_i, a) => {
    const text = $hub(a).text().replace(/\s+/g, ' ').trim();
    if (!text.includes('募集案内所一覧')) return;
    const href = $hub(a).attr('href');
    if (!href) return;
    let url;
    try { url = new URL(href, HUB_URL).href; } catch { return; }
    const pref = pcoSlug(url);
    if (!pref || targets.has(pref)) return;
    targets.set(pref, url);
  });

  const results = [];
  let n = 0;
  for (const [pref, url] of targets) {
    n++;
    if (n > 1) await sleep(DELAY_MS);
    let r;
    try {
      r = await fetchOnce(url);
    } catch (e) {
      results.push({ pref, url, error: e.message, current: current.get(pref) || [] });
      continue;
    }
    if (r.status === 403 || r.status === 429) {
      results.push({ pref, url, status: r.status, blocked: true, current: current.get(pref) || [] });
      continue;
    }
    const extracted = extractOfficeNames(r.body);
    const cur = current.get(pref) || [];
    const extractedNorm = new Map(extracted.map(x => [norm(x), x]));
    const curNorm = new Map(cur.map(x => [norm(x), x]));
    const missingCurrent = cur.filter(x => !extractedNorm.has(norm(x)));
    const candidateNew = extracted.filter(x => !curNorm.has(norm(x)));
    results.push({
      pref,
      url,
      finalUrl: r.finalUrl,
      status: r.status,
      currentCount: cur.length,
      extractedCount: extracted.length,
      missingCurrent,
      candidateNew,
      extracted,
    });
  }

  // 中央一覧側でリンクを取得できなかった地本も報告する。
  for (const [pref, names] of current) {
    if (!targets.has(pref)) results.push({ pref, noTarget: true, current: names });
  }

  results.sort((a,b) => a.pref.localeCompare(b.pref));
  fs.writeFileSync('/tmp/office-name-audit.json', JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
})();
