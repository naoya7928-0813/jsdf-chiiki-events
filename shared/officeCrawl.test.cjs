'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildOfficePages, orderOfficePages, crawlOfficePages, isOfficialHtml } = require('../scraper/lib/officeCrawl');
const base = 'https://www.mod.go.jp/pco/test/';
const page = (n, extra = {}) => ({ pref: 'test', url: base + n, normalized: base + n, officeIds: [n], officeNames: [n], scope: 'office', ...extra });
function options(pages, overrides = {}) {
  return { pages, fetchPage: async () => ({ document: {}, status: 200 }), extractHtml: () => [],
    collectAssets: () => [], findSubPages: () => [], processAssets: async () => ({ events: [], results: [] }), ocrReady: true, ...overrides };
}
test('追加窓口は関東除外に依存せず登録され、共通イベントURLは1回へ集約', () => {
  const offices = [{ id: 'old', pref: 'test', type: 'recruitment', name: '旧窓口', url: base + 'old' }];
  const configured = ['a', 'b'].map(id => ({ id, pref: 'test', name: id, pages: [{ url: base + 'event#' + id, scope: 'shared' }] }));
  const plan = buildOfficePages(offices, configured, new Set(['test']), { test: [base + 'old'] });
  assert.equal(plan.length, 2);
  const shared = plan.find(p => p.explicit); assert.equal(shared.scope, 'shared'); assert.deepEqual(shared.officeIds, ['a', 'b']);
});
test('公式イベントページのみ許可し、調達・資料・偽装ホストを除外', () => {
  assert.equal(isOfficialHtml(base + 'event.html'), true);
  for (const u of [base+'choutatu/list.html',base+'event.pdf','https://evil.test/www.mod.go.jp/pco/event', 'javascript:void(0)']) assert.equal(isOfficialHtml(u), false, u);
});
test('確認済みイベントページを先行し、固定順で後方の窓口を飢餓状態にしない', () => {
  const p = [page('a'), page('b', { explicit: true }), page('c', { explicit: true }), page('d')];
  assert.deepEqual(orderOfficePages(p, 1).map(p=>p.url), ['c','b','d','a'].map(n=>base+n));
});
test('OCRエンジンが無い場合もHTMLのイベントは取得する。共通一覧に窓口名を会場として補完しない', async () => {
  let meta; const revisited = [];
  const result = await crawlOfficePages(options([page('event', {scope:'shared'})], { ocrReady:false,
    extractHtml: (_doc,_url,m) => { meta=m; return [{ title:'説明会' }]; }, markRevisited:u=>revisited.push(u) }));
  assert.equal(result.events.length, 1); assert.deepEqual(meta.officeNames, []);
  assert.equal(result.pages[0].ocr.status, 'engine_unavailable'); assert.deepEqual(revisited,[base+'event']);
});
test('403・通信失敗は取得成功やイベントなしに数えず、再試行せず前回データの情報源を維持', async () => {
  const calls=[]; const visited=[];
  const r=await crawlOfficePages(options([page('a'),page('b')], {fetchPage:async p=>{calls.push(p.url);if(p.url.endsWith('b'))throw Error('timeout');return {status:403,error:'HTTP 403'};},markRevisited:u=>visited.push(u)}));
  assert.equal(calls.length,2);assert.equal(r.pages.filter(p=>p.status==='fetch_failed').length,2);assert.deepEqual(visited,[]);
});
test('HTML取得中に期限へ達した場合はOCRを開始せず、残り窓口を未巡回として記録', async () => {
  let expired=false; let attempts=0;
  const r=await crawlOfficePages(options([page('a'),page('b')],{fetchPage:async()=>{expired=true;return {document:{},status:200};},collectAssets:()=>[{url:base+'flyer.pdf'}],cutoffReached:()=>expired,processAssets:async()=>{attempts++;return {events:[],results:[]};}}));
  assert.equal(attempts,0); assert.equal(r.pages[0].ocr.reason,'cutoff'); assert.equal(r.pages[1].reason,'cutoff');
});
test('イベント下位ページを取得し、登録済みURL・調達URL・重複URLへ再アクセスしない',async()=>{
  const calls=[]; const r=await crawlOfficePages(options([page('a'),page('b')],{fetchPage:async p=>{calls.push(p.url);return {document:{},status:200};},findSubPages:(_d,u)=>u.endsWith('a')?[{url:base+'b'},{url:base+'c'},{url:base+'c#x'},{url:base+'choutatu/x'}]:[]}));
  assert.deepEqual(calls,[base+'a',base+'c',base+'b']); assert.equal(r.pages.length,3);
});
test('OCR処理結果なし・上限による未処理候補を区別して残す',async()=>{
  const r=await crawlOfficePages(options([page('a')],{collectAssets:()=>[{url:'one'},{url:'two'}],processAssets:async()=>({events:[],results:[{url:'one',status:'no_result'}],deferred:1})}));
  assert.equal(r.pages[0].ocr.results[0].status,'no_result');assert.equal(r.pages[0].ocr.deferred,1);
});
test('兵庫の1日1回制限とdocument-only方針を保持',async()=>{
  const hyogo=page('h',{pref:'hyogo'});
  const skipped=await crawlOfficePages(options([hyogo],{skipReason:()=> 'hyogo_daily_limit'}));
  assert.equal(skipped.pages[0].status,'not_visited');assert.equal(skipped.pages[0].reason,'hyogo_daily_limit');
  const r=await crawlOfficePages(options([hyogo],{collectAssets:()=>{throw Error('unexpected OCR');}}));
  assert.equal(r.pages[0].ocr.reason,'document_only');
});
test('登録した追加窓口59件が、一次ソース確認済みのHTML巡回先を持つ',()=>{
  const registry=require('../scraper/config/office-event-sources.json');
  assert.equal(registry.offices.length,59); assert.equal(new Set(registry.offices.map(o=>o.id)).size,59);
  for(const o of registry.offices){assert.ok(o.pages.length>0,o.name);for(const p of o.pages){assert.ok(isOfficialHtml(p.url),p.url);assert.ok(p.evidenceKey);assert.ok(p.fetchedAt);}}
});
