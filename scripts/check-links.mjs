/**
 * 公開中イベントの公式リンク（url）のリンク切れ検査。
 * 実行: node scripts/check-links.mjs        （.github/workflows/link-check.yml が週1回実行）
 *
 * 相手サイトへの配慮（合法・礼儀の範囲で取得する）:
 *   - 正直な User-Agent（当サイト名と連絡先URL）。ブラウザのふりはしない
 *   - robots.txt に従う（取得できない 5xx・通信失敗のときはそのホストを確認しない）
 *   - 1件ずつ、間隔を空ける（既定 3 秒）。同じ URL は1回だけ。本文は読み捨てる
 *   - ボット確認画面・403 は「確認できなかった」として扱い、回避しない
 * 判定は shared/linkCheck.cjs。リンク切れ（404/410）だけを報告する。ジョブは落とさない。
 */
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import { classifyLink, isChallengePage, parseRobots, robotsPolicyFromStatus, isPublicHttpUrl, makeSafeLookup } from '../shared/linkCheck.cjs';
import { siteUrl } from '../shared/siteUrl.cjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UA = `jsdf-chiiki-events-linkcheck/1.0 (+${siteUrl(process.env)}/)`;
const INTERVAL_MS = Number(process.env.LINK_CHECK_INTERVAL_MS || 3000);
const TIMEOUT_MS = 20000;
const MAX_URLS = Number(process.env.LINK_CHECK_MAX || 300);

// LINK_CHECK_EVENTS はテスト用（既定は公開データ）
const data = JSON.parse(readFileSync(process.env.LINK_CHECK_EVENTS || join(__dirname, '../public/data/events.json'), 'utf8'));
const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const byUrl = new Map();
for (const [pref, arr] of Object.entries(data)) {
  if (!Array.isArray(arr)) continue;
  for (const ev of arr) {
    if (!ev?.url || !/^https?:\/\//.test(ev.url)) continue;
    if ((ev.endDate || ev.date) < today) continue; // 終わったイベントは確認しない
    if (!byUrl.has(ev.url)) byUrl.set(ev.url, []);
    byUrl.get(ev.url).push({ pref, id: ev.id, title: ev.title, date: ev.date });
  }
}
const urls = [...byUrl.keys()].slice(0, MAX_URLS);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// 内部ネットワークへは接続しない（テスト用に LINK_CHECK_ALLOW_LOCAL=1 で外せる）。
//   1. URL の形（IP直書き・localhost・内部向けドメイン・特殊ポート）を isPublicHttpUrl で弾く
//   2. 名前解決の結果を isPrivateAddress で検査し、検査したアドレスにだけ接続する（lookup を差し替えるので、
//      検査後に別のアドレスへつながる＝DNS の切り替えを使った回り込みも起きない）
//   3. リダイレクトは自分で1段ずつたどり、行き先ごとに 1・2 をやり直す（robots.txt の取得も同じ）
// fetch は名前解決を差し替えられないため、node:http/https で取得する
const ALLOW_LOCAL = process.env.LINK_CHECK_ALLOW_LOCAL === '1';
const reachable = (u) => ALLOW_LOCAL || isPublicHttpUrl(u);

const safeLookup = makeSafeLookup(dns.lookup, ALLOW_LOCAL);

/** 1回だけ GET する（リダイレクトはたどらない）。本文は readBody バイトまで読んで捨てる */
function requestOnce(url, readBody) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const mod = url.startsWith('https:') ? https : http;
    let req;
    try {
      req = mod.get(url, { headers: { 'user-agent': UA, accept: '*/*' }, lookup: safeLookup, timeout: TIMEOUT_MS }, (res) => {
        const chunks = []; let size = 0;
        const out = () => ({ status: res.statusCode, location: res.headers.location || '', body: Buffer.concat(chunks).toString('utf8') });
        if (!readBody) { res.resume(); finish(out()); req.destroy(); return; }
        res.on('data', (c) => {
          chunks.push(c); size += c.length;
          if (size >= readBody) { finish(out()); req.destroy(); }
        });
        res.on('end', () => finish(out()));
        res.on('error', () => finish(out()));
      });
    } catch (err) { finish({ error: err.message }); return; }
    req.on('timeout', () => { req.destroy(); finish({ error: 'timeout' }); });
    req.on('error', (err) => finish({ error: err.code === 'EBLOCKED' ? 'not-public-address' : (err.code || err.message) }));
  });
}

/** リダイレクトを1段ずつ検査しながらたどる（最大5回） */
async function getFollow(url, readBody) {
  let cur = url;
  for (let hop = 0; hop <= 5; hop++) {
    if (!reachable(cur)) return { error: 'not-public-url' };
    const r = await requestOnce(cur, readBody);
    if (r.error) return r;
    if (r.status >= 300 && r.status < 400 && r.location && hop < 5) {
      try { cur = new URL(r.location, cur).href; } catch { return { error: 'bad-redirect' }; }
      continue;
    }
    return r;
  }
  return { error: 'too-many-redirects' };
}

async function get(url) {
  const r = await getFollow(url, 2000);
  if (r.error) return { error: r.error };
  return { status: r.status, challenge: isChallengePage(r.status, r.body) };
}

const robotsCache = new Map();
async function allowed(url) {
  if (!reachable(url)) return false;
  const u = new URL(url);
  if (!robotsCache.has(u.origin)) {
    let fn;
    const r = await getFollow(`${u.origin}/robots.txt`, 512 * 1024);
    if (r.error) fn = () => false; // robots.txt が取れない＝確認しない（RFC 9309）
    else {
      const policy = robotsPolicyFromStatus(r.status);
      fn = policy === 'parse' ? parseRobots(r.body, UA) : () => policy === 'allow_all';
    }
    robotsCache.set(u.origin, fn);
    await sleep(INTERVAL_MS);
  }
  return robotsCache.get(u.origin)(u.pathname + u.search);
}

const results = [];
for (const url of urls) {
  let r;
  if (!(await allowed(url))) r = { disallowed: true };
  else { r = await get(url); await sleep(INTERVAL_MS); }
  results.push({ url, result: classifyLink(r), status: r.status ?? null, note: r.error || (r.challenge ? 'bot-check' : r.disallowed ? 'robots' : ''), events: byUrl.get(url) });
}

const count = (k) => results.filter(r => r.result === k).length;
const broken = results.filter(r => r.result === 'broken');
console.log(`[リンク検査] ${results.length} URL: 正常 ${count('ok')} / リンク切れ ${broken.length} / 確認できず ${count('unknown')}`);
for (const b of broken) {
  for (const e of b.events) console.log(`::warning title=公式リンク切れ::[${e.pref}] ${e.date} ${e.title} → ${b.url}（HTTP ${b.status}）`);
}
writeFileSync(join(__dirname, '../scraper/link-check-report.json'),
  JSON.stringify({ checkedAt: new Date().toISOString(), summary: { total: results.length, ok: count('ok'), broken: broken.length, unknown: count('unknown') }, broken }, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `### 公式リンクの検査\n\n- 確認 ${results.length} 件：正常 ${count('ok')}／**リンク切れ ${broken.length}**／確認できず ${count('unknown')}（ボット確認画面・robots.txt・通信失敗）\n\n` +
    (broken.length ? `| 地本 | 開催日 | イベント | URL |\n|---|---|---|---|\n${broken.flatMap(b => b.events.map(e => `| ${e.pref} | ${e.date} | ${e.title} | ${b.url} |`)).join('\n')}\n` : ''));
}
