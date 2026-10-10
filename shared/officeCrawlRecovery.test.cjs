'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { planOfficeAssets } = require('../scraper/lib/officeAssetQueue');
let cheerio; try { cheerio=require('../scraper/node_modules/cheerio'); } catch {}
const { readOfficeSnapshot, decodeHtml } = require('../scraper/lib/officePageSnapshot');
test('廃止された先輩紹介リンクを除外し、十三の説明会は現行共通一覧を巡回する', { skip: !cheerio }, () => {
  const { findEventLinks } = require('../scraper/lib/exploreLinks');
  const $ = cheerio.load('<a href="https://www.mod.go.jp/pco/shimane/recruit/senior.html">先輩自衛官</a><a href="https://www.mod.go.jp/pco/osaka/recruit/session/jyuso.html">十三説明会</a>');
  const { pages } = findEventLinks($, 'https://www.mod.go.jp/pco/osaka/');
  assert.equal(pages.length, 1);
  assert.equal(pages[0].url, 'https://www.mod.go.jp/pco/osaka/recruit/session/menu.html');
  assert.equal(pages[0].scope, 'shared');
});
test('限られたOCR枠でも後続資料を巡回し、低優先の除外資料を未処理候補へ数えない', () => {
  const assets = Array.from({length: 7}, (_,i) => ({url:`https://www.mod.go.jp/pco/test/event${i}.pdf`, normalized:'event',type:'pdf',linkText:'説明会',sourcePageUrl:'event'}));
  assets.push({url:'https://www.mod.go.jp/pco/test/past.pdf',normalized:'past',type:'pdf',linkText:'過去のイベント',sourcePageUrl:'event'});
  const visited = new Set();
  for(let run=0;run<4;run++) {
    const plan=planOfficeAssets(assets,2,run);plan.selected.forEach(a=>visited.add(a.url));
    assert.equal(plan.eligible,7);assert.equal(plan.ignored,1);assert.equal(plan.deferred,5);
  }
  assert.equal(visited.size,7);
  assert.equal(planOfficeAssets(assets,0,1).selected.length,0);
});
test('画面遷移中のDOM読取失敗では受信済みHTMLを使い、追加HTTPを発行しない', async () => {
  let requests=0;const response={status:()=>200,url:()=> 'https://www.mod.go.jp/pco/test/new/',body:async()=>Buffer.from('<title>公式案内</title>'),headers:()=>({'content-type':'text/html; charset=utf-8'})};
  const page={goto:async()=>{requests++;return response;},content:async()=>{throw Error('navigating');},url:()=>response.url()};
  const r=await readOfficeSnapshot(page,'https://www.mod.go.jp/pco/test/');assert.equal(r.status,200);assert.match(r.html,/公式案内/);assert.equal(requests,1);
});
test('ロード待機タイムアウトでも受信済みレスポンスがなければ成功扱いしない',async()=>{
  await assert.rejects(readOfficeSnapshot({goto:async()=>{throw Error('timeout');}},'https://www.mod.go.jp/pco/test/'),/timeout/);
});
test('日本語HTMLのShift_JIS宣言を保持し、文字化けさせない',()=>{
  assert.equal(decodeHtml(Buffer.from([0x93,0xfa,0x96,0x7b]),{'content-type':'text/html; charset=Shift_JIS'}),'日本');
});
test('ロード待機の失敗後も正常に受信したHTMLは利用し、403を200へ変えない',async()=>{
  let handler; const response={status:()=>403,url:()=> 'https://www.mod.go.jp/pco/test/blocked',request:()=>({isNavigationRequest:()=>true,frame:()=> 'main'})};
  const page={on:(_event,fn)=>handler=fn,mainFrame:()=> 'main',goto:async()=>{handler(response);throw Error('timeout');},content:async()=>'<title>Forbidden</title>'};
  const r=await readOfficeSnapshot(page,response.url());assert.equal(r.status,403);
});
test('転送先のURLで資料と子ページを解決し、共通一覧へ置換したページに窓口会場を補完しない',async()=>{
  const {crawlOfficePages}=require('../scraper/lib/officeCrawl');const urls=[];const names=[];
  const root='https://www.mod.go.jp/pco/test/';const newUrl=root+'new/';
  const r=await crawlOfficePages({pages:[{pref:'test',url:root,normalized:root,officeNames:['窓口'],officeIds:['one'],scope:'office'}],ocrReady:false,
    fetchPage:async meta=>({document:{},status:200,finalUrl:meta.url===root?newUrl:meta.url}),
    extractHtml:(_doc,url,meta)=>{urls.push(url);names.push(meta.officeNames);return[];},collectAssets:()=>[],
    findSubPages:(_doc,url)=>{assert.equal(url,newUrl);return[{url:root+'shared.html',scope:'shared'}];}});
  assert.equal(urls[0],newUrl);assert.deepEqual(names[1],[]);assert.equal(r.pages.length,2);
});
test('公式HTMLのbaseと現行URL対応表を使い、壊れたドメイン表記を子ページとして巡回しない',{skip:!cheerio},()=>{
 const {findEventLinks}=require('../scraper/lib/exploreLinks');
  const r=findEventLinks(cheerio.load('<base href="https://www.mod.go.jp/pco/osaka/"><a href="recruit/list.html">説明会</a><a href="www.mod.go.jp/gsdf/jieikanbosyu/details/">募集案内</a>'),'https://www.mod.go.jp/pco/osaka/about/office/nanba.html');
  assert.equal(r.pages.length,1);assert.equal(r.pages[0].url,'https://www.mod.go.jp/pco/osaka/recruit/session/menu.html');assert.equal(r.pages[0].scope,'shared');assert.match(r.pages[0].remappedFrom,/list.html/);
});
