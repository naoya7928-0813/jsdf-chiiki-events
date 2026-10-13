'use strict';
const test = require('node:test'); const assert = require('node:assert/strict'); const path = require('node:path');
let cheerio; try { cheerio = require(require.resolve('cheerio', { paths: [path.join(__dirname, '../scraper')] })); } catch {}
const base='https://www.mod.go.jp/pco/test/event.html';const meta={pref:'test',officeNames:['テスト募集案内所']};
function parse(html) {
  const RealDate=Date; const fixed=new RealDate('2026-10-06T08:00:00+09:00').getTime();
  global.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[fixed]));}static now(){return fixed;}};
  try { return require('../scraper/index.js').extractOfficeHtmlEvents(cheerio.load(html),base,meta); }
  finally { global.Date=RealDate; }
}
test('過去年度の月日を今年や来年へ移さず、現在の年付き見出しから将来イベントを取得', {skip:!cheerio},()=>{
 const ev=parse('<h3>令和8年10月イベント一覧</h3><ul><li>地域防災体験イベント 10/10</li></ul><h3>令和7年12月イベント一覧</h3><ul><li>旧年度の就職説明会 12/22</li></ul>');
 assert.equal(ev.length,1);assert.equal(ev[0].date,'2026-10-10');assert.equal(ev[0].place,'');
});
test('年なしで終了した日付を翌年へ繰り越さない。明示した年度の1月は翌暦年', {skip:!cheerio},()=>{
 assert.deepEqual(parse('<ul><li>就職説明会 9月16日</li></ul>'),[]);
 const ev=parse('<h2>令和8年度</h2><ul><li>就職説明会 1月10日</li></ul>');assert.equal(ev[0].date,'2027-01-10');
});
test('年度と曜日が矛盾する過去の表を、表全体から将来イベントとして再取得しない', {skip:!cheerio},()=>{
 assert.deepEqual(parse('<section><h2>イベント（令和8年度）</h2><table><tr><th>日程</th><th>イベント名</th><th>場所</th></tr><tr><td>5月23日（日）</td><td>地域体験フェスタ</td><td>テスト広場</td></tr></table></section>'),[]);
});
test('日程・名称・会場の表を列ごとに取得し、活動報告を除外する', {skip:!cheerio},()=>{
 const ev=parse('<table><tr><th>日程</th><th>イベント名</th><th>場所</th></tr><tr><td>10月10日（土）</td><td>地域防災体験フェスタ</td><td>地域公園</td></tr></table><article>12月28日 生徒たちが説明会に遊びに来てくれました！</article>');
 assert.equal(ev.length,1);assert.equal(ev[0].date,'2026-10-10');assert.equal(ev[0].title,'地域防災体験フェスタ');assert.equal(ev[0].place,'地域公園');
});
test('HTTP403のHTMLを成功扱いせず、同じURLへ再試行しない', {skip:!cheerio},async()=>{
 const {fetchPagePlaywright}=require('../scraper/index.js');let navigations=0;
 const page={route:async()=>{},goto:async()=>{navigations++;return{status:()=>403};},content:async()=>'<title>Forbidden</title>',url:()=>base+'?blocked-test',close:async()=>{}};
 const ctx={newPage:async()=>page};assert.equal(await fetchPagePlaywright(ctx,base+'?blocked-test'),null);assert.equal(await fetchPagePlaywright(ctx,base+'?blocked-test'),null);assert.equal(navigations,1);
});
test('イベントディレクトリの末尾スラッシュを保ち、相対資料URLを別地本の共通階層へ誤解決しない', {skip:!cheerio},()=>{
 const {findEventLinks}=require('../scraper/lib/exploreLinks');
 const r=findEventLinks(cheerio.load('<a href="event/">イベント情報</a>'), 'https://www.mod.go.jp/pco/test/');
 assert.equal(r.pages[0].url,'https://www.mod.go.jp/pco/test/event/');
 assert.equal(new URL('file/event.pdf',r.pages[0].url).href,'https://www.mod.go.jp/pco/test/event/file/event.pdf');
});

// 2026-10: 神奈川・相模原の活動報告（見出し「「さがみ野ひばり祭」に参加（12/1）」＋本文「…出展してきました」）を
// 今年の予定として36件掲載していた。見出しの直後の本文・曜日の食い違いで過去の記事を除外する。
// 実際のページは「見出しの行」と「本文の行」が別の tr（相模原地域事務所のページの構造）
const block=(head,body)=>`<table border="1"><tbody><tr><td><b>${head}</b></td></tr><tr><td><p>${body}</p></td></tr></tbody></table>`;
test('見出しの直後が活動報告の本文なら、過去の記事としてイベントにしない', {skip:!cheerio},()=>{
 const ev=parse(block('「さがみ野ひばり祭」に参加（12/1）','12月1日(日）相模原地域事務所は、座間市の地域イベントにおいて、広報ブースを出展してきました。約５０名の方に立ち寄っていただきました。')
  +block('相模田名高校 職業体験ガイダンス（12/2）','12月2日(月）高校にて職業体験ガイダンスを実施しました。'));
 assert.deepEqual(ev,[]);
});
test('見出しの直後が開催の案内（お待ちしております・受付は終了しました）なら残す', {skip:!cheerio},()=>{
 const ev=parse(block('地域防災体験フェスタ（11/21）','11月21日（土）に開催します。多数のご来場をお待ちしております。')
  +block('駐屯地見学ツアー（11/22）','11月22日（日）。定員に達したため受付は終了しました。'));
 assert.deepEqual(ev.map(e=>e.date).sort(),['2026-11-21','2026-11-22']);
});
test('本文の曜日が決めた日付と食い違うなら、年を取り違えた過去の記事として除外する', {skip:!cheerio},()=>{
 // 2026-12-21 は月曜。本文は「12月21日(土)」＝2024年の記事
 assert.deepEqual(parse('<ul><li>イオン相模原SC自衛隊イベント（12/21）</li></ul><p>12月21日(土）広報ブースのご案内</p>'),[]);
 const ok=parse('<ul><li>就職説明会（12/19）</li></ul><p>12月19日(土）開催</p>');
 assert.equal(ok.length,1);
});
test('weekdayConflict（単体）', ()=>{
 const { weekdayConflict } = require('../scraper/lib/officeHtmlContext.js');
 assert.equal(weekdayConflict('12月21日(土）', '2026-12-21'), true);
 assert.equal(weekdayConflict('12月19日（土）', '2026-12-19'), false);
 assert.equal(weekdayConflict('12/21（月）', '2026-12-21'), false);
 assert.equal(weekdayConflict('曜日の記載なし 12月21日', '2026-12-21'), false);
 assert.equal(weekdayConflict('１２月２１日（土）', '2026-12-21'), true, '全角数字');
});
