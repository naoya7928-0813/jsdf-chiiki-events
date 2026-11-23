/**
 * 表示速度（Core Web Vitals の目安）をラボ環境で測る。
 * 実行: node scripts/measure-web-vitals.mjs [ベースURL] [パス...]
 *   例: node scripts/measure-web-vitals.mjs https://jsdf-chiiki-events.jp / /list /events.html
 *   既定は http://localhost:4173（npx vite preview）
 *
 * 低速回線（下り1.6Mbps・遅延150ms＝Lighthouse のモバイル相当）と CPU 4倍遅延のスマホ幅で、
 * 初回訪問（キャッシュなし・同意済み）を3回測り中央値を出す。
 *   LCP … 最大の要素が描画されるまで（目標 2.5 秒以内）
 *   CLS … 表示のずれ（目標 0.1 以下）
 *   TBT … 50ms を超える長いタスクの合計（INP の目安。実測の INP は Vercel Speed Insights を見る）
 * ※ ラボ値は端末・回線で変わる。改善前後の比較に使い、実利用者の値は Speed Insights で確認する。
 */
import { createRequire } from 'node:module';
// playwright は依存に入れていない（CI・開発機に導入済みのものを使う）。ESM の import は NODE_PATH を見ないため require で読む
const { chromium } = createRequire(import.meta.url)('playwright');

const base = (process.argv[2] || 'http://localhost:4173').replace(/\/$/, '');
const paths = process.argv.slice(3).length ? process.argv.slice(3) : ['/', '/list'];
const RUNS = Number(process.env.RUNS || 3);
const LEGAL = process.env.LEGAL_VERSION || '';

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

async function measure(browser, url) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  // 同意済み・スプラッシュ表示済みの状態で測る（同意画面やスプラッシュの演出時間を除く）
  await page.addInitScript((v) => {
    try { if (v) localStorage.setItem('jsdf-legal-accepted', v); sessionStorage.setItem('jsdf-splash-shown', '1'); } catch {}
    window.__cwv = { lcp: 0, cls: 0, tbt: 0 };
    new PerformanceObserver(l => { for (const e of l.getEntries()) window.__cwv.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cwv.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver(l => { for (const e of l.getEntries()) window.__cwv.tbt += Math.max(0, e.duration - 50); }).observe({ type: 'longtask', buffered: true });
  }, LEGAL);
  let bytes = 0;
  page.on('requestfinished', async req => { try { const z = await req.sizes(); bytes += z.responseBodySize + z.responseHeadersSize; } catch {} });
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(4000);
  // LCP は操作で確定する。スクロールせずクリックだけ送る
  await page.mouse.click(5, 5).catch(() => {});
  const v = await page.evaluate(() => window.__cwv);
  await ctx.close();
  return { ...v, kb: Math.round(bytes / 1024) };
}

const browser = await chromium.launch();
console.log(`計測: ${base}（低速4G相当・CPU4倍遅延・390px幅・各${RUNS}回の中央値）`);
for (const p of paths) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) runs.push(await measure(browser, base + p));
  const lcp = median(runs.map(r => r.lcp)) / 1000, cls = median(runs.map(r => r.cls)), tbt = median(runs.map(r => r.tbt));
  const mark = (ok) => (ok ? '✅' : '⚠️');
  console.log(`${p.padEnd(28)} LCP ${lcp.toFixed(2)}s ${mark(lcp <= 2.5)}  CLS ${cls.toFixed(3)} ${mark(cls <= 0.1)}  TBT ${Math.round(tbt)}ms ${mark(tbt <= 200)}  受信 約${median(runs.map(r => r.kb))}KB（圧縮前）`);
}
await browser.close();
