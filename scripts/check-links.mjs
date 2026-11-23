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
import { classifyLink, isChallengePage, parseRobots, robotsPolicyFromStatus, isPublicHttpUrl } from '../shared/linkCheck.cjs';
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
// 内部ネットワーク（IP直書き・localhost 等）へは接続しない。テスト用に LINK_CHECK_ALLOW_LOCAL=1 で外せる
const ALLOW_LOCAL = process.env.LINK_CHECK_ALLOW_LOCAL === '1';
const reachable = (u) => ALLOW_LOCAL || isPublicHttpUrl(u);
async function get(url) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    // リダイレクトは自分で1段ずつたどり、行き先も公開URLか確かめる（最大5回）
    let res, cur = url;
    for (let hop = 0; ; hop++) {
      if (!reachable(cur)) return { error: 'not-public-url' };
      res = await fetch(cur, { headers: { 'user-agent': UA, accept: '*/*' }, redirect: 'manual', signal: ac.signal });
      const loc = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && loc && hop < 5) {
        await res.body?.cancel().catch(() => {});
        cur = new URL(loc, cur).href;
        continue;
      }
      break;
    }
    let start = '';
    if (res.status === 403 || res.status === 503 || res.status === 429) {
      start = (await res.text().catch(() => '')).slice(0, 2000);
    } else {
      await res.body?.cancel().catch(() => {});
    }
    return { status: res.status, challenge: isChallengePage(res.status, start) };
  } catch (err) {
    return { error: err.name === 'AbortError' ? 'timeout' : err.message };
  } finally {
    clearTimeout(timer);
  }
}

const robotsCache = new Map();
async function allowed(url) {
  if (!reachable(url)) return false;
  const u = new URL(url);
  if (!robotsCache.has(u.origin)) {
    let fn;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${u.origin}/robots.txt`, { headers: { 'user-agent': UA }, signal: ac.signal });
      const policy = robotsPolicyFromStatus(res.status);
      if (policy === 'parse') fn = parseRobots(await res.text(), UA);
      else { await res.body?.cancel().catch(() => {}); fn = () => policy === 'allow_all'; }
    } catch {
      fn = () => false; // robots.txt が取れない＝確認しない（RFC 9309）
    } finally {
      clearTimeout(timer);
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
