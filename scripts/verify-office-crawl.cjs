'use strict';
// Read-only verification: never invoke main/writeOutput or publish events.
const fs = require('node:fs'); const path = require('node:path');
const root = path.resolve(__dirname, '..');
const { chromium } = require('../scraper/node_modules/playwright');
const { fetchPagePlaywright, createStealthContext, extractOfficeCandidateAssets,
  ocrFlyerFull, hasAnyOcrEngine, getOfficePageResponse } = require('../scraper/index');
const { planOfficeAssets } = require('../scraper/lib/officeAssetQueue');
const policy = require('../scraper/config/office-source-recovery.json');
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function main() {
  const urls = [...new Set([...Object.values(policy.aliases).map(x => x.url),
    'https://www.mod.go.jp/pco/tochigi/contact.html',
    'https://www.mod.go.jp/pco/tochigi/recruit.html',
    'https://www.mod.go.jp/pco/tochigi/event.html',
    'https://www.mod.go.jp/pco/miyagi/miyagitop/event.html',
    'https://www.mod.go.jp/pco/tokyo/kouenji/',
    'https://www.mod.go.jp/pco/tokyo/koutou/'])];
  const report = { checkedAt: new Date().toISOString(), runId: process.env.GITHUB_RUN_ID,
    headSha: process.env.GITHUB_SHA, pages: [], ocrBudget: 2, ocr: [] };
  let browser;
  try {
    const ocrReady = await hasAnyOcrEngine(); report.ocrReady = ocrReady;
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox','--disable-dev-shm-usage'] });
    const attemptedAssets = new Set();
    for (const url of urls) {
      const ctx = await createStealthContext(browser);
      try {
        const $ = await fetchPagePlaywright(ctx, url);
        const response = getOfficePageResponse(url) || {};
        const row = { url, httpStatus: response.status || null, finalUrl: response.finalUrl || url, error: response.error || null, status: $ ? 'fetched' : 'fetch_failed', title: $ ? $('title').text() : null };
        report.pages.push(row); console.log(JSON.stringify(row));
        if ($ && ocrReady && report.ocr.length < report.ocrBudget) {
          const assets = extractOfficeCandidateAssets($, url).filter(a => !attemptedAssets.has(a.url));
          const plan = planOfficeAssets(assets, 1, process.env.GITHUB_RUN_NUMBER);
          for (const asset of plan.selected) {
            attemptedAssets.add(asset.url);
            const result = await ocrFlyerFull(asset.url);
            report.ocr.push({ url: asset.url, sourcePageUrl: url, status: result ? 'read' : 'no_result' });
            await sleep(1500);
          }
        }
      } finally { await ctx.close(); }
      await sleep(2000);
    }
  } catch (error) { report.error = error.message; process.exitCode = 1; }
  finally {
    await browser?.close();
    fs.writeFileSync(path.join(root, 'scraper/office-crawl-verification.json'), JSON.stringify(report, null, 2)+'\n');
    const fetched = report.pages.filter(p => p.status === 'fetched').length;
    if (fetched !== urls.length) process.exitCode = 1;
    require('../scraper/lib/assetCache').save();
    const audit = JSON.parse(fs.readFileSync(path.join(root,'docs/office-audit-20261004.json'),'utf8'));
    const text = `HTML取得 ${fetched}/${urls.length} URL、OCR読取結果あり ${report.ocr.filter(p=>p.status==='read').length}/${report.ocr.length} 資料（上限2）。\n`+
      `全国の項目照合は未完了: 未確定候補 ${audit.pending.length}件、既存不足 ${audit.remainingFieldGaps.length}件。\n`+
      `取得失敗: ${report.pages.filter(p=>p.status==='fetch_failed').map(p=>p.url).join('、') || 'なし'}\n`;
    console.log(text);
    if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,text);
  }
}
main().catch(error => { console.error(error.message); process.exitCode=1; });
