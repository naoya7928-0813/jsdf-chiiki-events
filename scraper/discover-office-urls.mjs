/**
 * discover-office-urls.mjs
 *
 * 関東以外の各地本サイトをクロールし、募集案内所・地域事務所・出張所等の
 * 「個別公式ページ」を自動発見して offices.json の url に反映する。
 *
 * 方式（県ごとにサイト構造が違うため汎用化）:
 *   1. 地本トップ(HQのurl)をクロールして同一県ツリーの内部リンクを収集
 *   2. 一覧/index系リンクを1段だけ辿って候補ページを追加
 *   3. 各候補ページの <title> を取得
 *   4. 拠点名から地名コア(接尾辞を除いた部分)を作り、タイトルに地名コア＋拠点種別語を
 *      含む候補を最良一致として採用
 *   5. 採用URLは curl(ブラウザUA)で HTTP 200 を確認してから書き込む
 *
 * mod.go.jp は Node の fetch をbot対策で403にするため取得は curl 経由。
 * Shift_JIS/EUC/UTF-8 を iconv-lite で判定デコード。
 *
 * 使用方法:
 *   node scraper/discover-office-urls.mjs --dry                # 全県・検証のみ
 *   node scraper/discover-office-urls.mjs --prefs=aichi,osaka   # 対象県を限定
 *   node scraper/discover-office-urls.mjs                       # 全県・書き込み
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';

const execFileAsync = promisify(execFile);
const ROOT     = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_JSON = path.join(ROOT, 'public/data/offices.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const KANTO = new Set(['ibaraki', 'gunma', 'tochigi', 'chiba', 'saitama', 'tokyo', 'kanagawa']);
const DRY   = process.argv.includes('--dry');
const PREFS = (process.argv.find(a => a.startsWith('--prefs=')) || '').split('=')[1];
const ONLY  = PREFS ? new Set(PREFS.split(',').map(s => s.trim()).filter(Boolean)) : null;

const sleep = ms => new Promise(r => setTimeout(r, ms));

const SUFFIX_RE = /(募集案内所|地域事務所|地区事務所|地域事務室|出張所|分駐所|駐在員事務所|駐在所|連絡所|募集事務所|事務所|案内所)$/;
const TYPE_KW   = /(募集案内所|地域事務所|地区事務所|地域事務室|出張所|分駐所|駐在員事務所|駐在所|連絡所|事務所|案内所)/;
const INDEXISH  = /(list|map|contact|jimu|annai|mado|office|chiiki|tenpo|madoguchi|access|shibu|branch|index)/i;
const ASSET_RE  = /\.(pdf|jpe?g|png|gif|svg|docx?|xlsx?|pptx?|zip|mp4)$/i;
const JUNK_PATH = /\/(btn|common|cmn|css|js|img|images|image|assets|cdn-cgi)\//i;
// HP ではなく記事・イベント・お知らせページ（HP要件外）は候補から除外
const ARTICLE_RE = /(post-\d|topics|\/news|oshirase|event|briefing|seminar|setsumeikai|\/20\d{2}[_\-\/]|\/\d{4,}\/?$)/i;

const placeCore = name => name.replace(/\s+/g, '').replace(SUFFIX_RE, '');
const escapeRe  = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// タイトルと拠点名の一致度。地名コアだけの一致は誤マッチ(入札/ニュース等)の温床なので採らない。
//   2 = 拠点名そのものを含む（最良）
//   1 = 地名コアの直後に種別語が隣接（例: タイトル「安城募集案内所」）
//   0 = 不一致
function matchScore(name, title) {
  const t = (title || '').replace(/\s+/g, '');
  if (!t) return 0;
  const full = name.replace(/\s+/g, '');
  if (t.includes(full)) return 2;
  const core = placeCore(name);
  if (core.length >= 1 && new RegExp(escapeRe(core) + TYPE_KW.source).test(t)) return 1;
  return 0;
}

async function curlBuf(url) {
  for (let i = 0; i < 2; i++) {
    try {
      const { stdout } = await execFileAsync(
        'curl', ['-s', '-L', '--max-time', '25', '-A', UA, url],
        { encoding: 'buffer', maxBuffer: 12 * 1024 * 1024, timeout: 35000 },
      );
      if (stdout && stdout.length) return stdout;
    } catch (e) {
      if (e && e.stdout && e.stdout.length) return e.stdout;
    }
    await sleep(500);
  }
  return null;
}

async function httpStatus(url) {
  for (let i = 0; i < 2; i++) {
    try {
      const { stdout } = await execFileAsync(
        'curl', ['-s', '-o', process.platform === 'win32' ? 'NUL' : '/dev/null',
          '-w', '%{http_code}', '-L', '--max-time', '20', '-A', UA, url],
        { timeout: 30000 },
      );
      const code = parseInt(String(stdout).trim(), 10);
      if (Number.isFinite(code) && code > 0) return code;
    } catch { /* retry */ }
    await sleep(500);
  }
  return 0;
}

function decode(buf) {
  const head = buf.slice(0, 4096).toString('latin1');
  const m = head.match(/charset\s*=\s*["']?\s*([\w-]+)/i);
  let cs = (m ? m[1] : 'utf-8').toLowerCase();
  if (/shift|sjis|x-sjis|932|windows-31j/.test(cs)) cs = 'cp932';
  else if (/euc/.test(cs)) cs = 'euc-jp';
  if (!iconv.encodingExists(cs)) cs = 'utf-8';
  try { return iconv.decode(buf, cs); } catch { return buf.toString('utf-8'); }
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].replace(/\s+/g, ' ').replace(/&nbsp;/g, ' ').trim() : '';
}

function internalLinks(html, baseUrl, prefix) {
  const $ = cheerio.load(html);
  const out = new Set();
  $('a[href]').each((_i, el) => {
    let href = ($(el).attr('href') || '').trim();
    if (!href || href.startsWith('#') || /^(mailto|tel|javascript):/i.test(href)) return;
    let abs;
    try { abs = new URL(href, baseUrl).href.split('#')[0]; } catch { return; }
    if (!abs.startsWith(prefix)) return;
    if (ASSET_RE.test(abs) || JUNK_PATH.test(abs) || ARTICLE_RE.test(abs)) return;
    out.add(abs);
  });
  return [...out];
}

async function discoverPref(pref, prefix, offices) {
  // 1段目: 地本トップ
  const rootBuf = await curlBuf(prefix);
  if (!rootBuf) { console.warn(`[${pref}] トップ取得失敗: ${prefix}`); return; }
  const rootHtml = decode(rootBuf);
  let candidates = internalLinks(rootHtml, prefix, prefix);

  // 2段目: index/list 系リンクを辿って候補を追加
  const indexish = candidates.filter(u => INDEXISH.test(u)).slice(0, 12);
  for (const idx of indexish) {
    const buf = await curlBuf(idx);
    if (!buf) continue;
    candidates.push(...internalLinks(decode(buf), idx, prefix));
    await sleep(150);
  }
  candidates = [...new Set(candidates)].filter(u => u !== prefix && u !== `${prefix}index.html`);
  if (candidates.length > 140) candidates = candidates.slice(0, 140);

  // 各候補のタイトル取得
  const titled = [];
  for (const url of candidates) {
    const buf = await curlBuf(url);
    if (!buf) continue;
    const title = extractTitle(decode(buf));
    if (title) titled.push({ url, title });
    await sleep(120);
  }

  // 拠点ごとに照合（厳格: スコア>=1 のみ。地名コア単独一致は不採用）
  let matched = 0;
  for (const o of offices) {
    const scored = titled
      .map(c => ({ ...c, score: matchScore(o.name, c.title) }))
      .filter(c => c.score >= 1)
      .sort((a, b) => b.score - a.score || a.title.length - b.title.length);
    if (!scored.length) { o._disc = { status: 'unmatched' }; continue; }
    const chosen = scored[0];
    o._disc = { status: 'match', url: chosen.url, title: chosen.title };
    matched++;
  }
  console.log(`[${pref}] 候補ページ:${titled.length}  一致:${matched}/${offices.length}`);
}

async function main() {
  const data = JSON.parse(fs.readFileSync(OUT_JSON, 'utf8'));
  // pref -> HQ url（個別ページの基準プレフィックス）
  const hqUrl = {};
  for (const o of data.offices) if (o.type === 'hq') hqUrl[o.pref] = o.url;

  const targets = {};
  for (const o of data.offices) {
    if (o.type === 'hq' || KANTO.has(o.pref)) continue;
    if (ONLY && !ONLY.has(o.pref)) continue;
    (targets[o.pref] = targets[o.pref] || []).push(o);
  }

  const prefs = Object.keys(targets).sort();
  console.log(`対象県: ${prefs.length}（${prefs.join(', ')}）\n`);

  for (const pref of prefs) {
    const prefix = hqUrl[pref];
    if (!prefix) { console.warn(`[${pref}] HQ url 不明 → スキップ`); continue; }
    await discoverPref(pref, prefix, targets[pref]);
  }

  // 採用前に 200 検証 → 書き込み
  let updated = 0, verified = 0, failed = 0, unmatched = 0;
  for (const pref of prefs) {
    for (const o of targets[pref]) {
      const d = o._disc;
      if (!d || d.status !== 'match') { if (d && d.status === 'unmatched') unmatched++; delete o._disc; continue; }
      const code = await httpStatus(d.url);
      if (code === 200) {
        verified++;
        o.hasOfficialPage = true;
        if (o.url !== d.url) { o.url = d.url; updated++; console.log(`✓ ${pref} ${o.name} → ${d.url}`); }
      } else {
        failed++;
        console.warn(`✗ ${pref} ${o.name} (HTTP ${code}) 据え置き: ${d.url}`);
      }
      delete o._disc;
    }
  }

  console.log(`\n更新:${updated} 200確認:${verified} 検証失敗:${failed} 未一致:${unmatched}`);
  if (DRY) { console.log('--dry のため書き込みません'); return; }
  if (updated > 0) {
    fs.writeFileSync(OUT_JSON, JSON.stringify(data, null, 2) + '\n', 'utf8');
    console.log(`offices.json を更新しました (${updated}件)`);
  } else {
    console.log('更新対象がないため書き込みませんでした');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
