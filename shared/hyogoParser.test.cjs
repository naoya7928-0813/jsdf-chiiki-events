'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

let cheerio = null;
try { cheerio = require(require.resolve('cheerio', { paths: [path.join(__dirname, '../scraper')] })); } catch { /* scraper deps required */ }
const skip = cheerio ? false : 'cheerio 未インストール（scraper の依存が必要）';

function withNow(iso, fn) {
  const RealDate = Date;
  const fixed = new RealDate(iso).getTime();
  global.Date = class extends RealDate {
    constructor(...a) { super(...(a.length ? a : [fixed])); }
    static now() { return fixed; }
  };
  try {
    delete require.cache[require.resolve('../scraper/parsers/hyogo')];
    delete require.cache[require.resolve('../scraper/parsers/utils')];
    return fn(require('../scraper/parsers/hyogo'));
  } finally { global.Date = RealDate; }
}

const eventHtml = `
<main>
  <h2>イベント情報</h2>
  <section id="amatsusora1024" class="event-box">
    <h3>海上輸送群輸送艦「あまつそら」特別公開</h3>
    <a href="./flyer/amatsusora1024.pdf">チラシ</a>
    <h4>日　時</h4><p>令和8年10月24日（土）09：00～16：00</p>
    <h4>場　所</h4><p>飾磨港4号岸壁</p>
    <h4>応募条件</h4><p>兵庫県内在住の18歳から32歳までの方とその保護者</p>
    <h4>締め切り</h4><p>10月19日(月)12時まで</p>
  </section>
  <section id="aoshima1004" class="event-box">
    <h3>掃海艇「あおしま」一般公開</h3>
    <h4>日　時</h4><p>令和8年10月4日（日）09：00～16：00</p>
    <h4>場　所</h4><p>高砂西岸壁</p>
  </section>
</main>`;

const briefingHtml = `
<main>
  <h2>自衛隊 説明会まとめ</h2>
  <h3>西　宮</h3>
  <div id="nishinomiya1003">
    <h4>陸上自衛隊高等工科学校説明会</h4>
    <ul><li>
      <h4>陸上自衛隊高等工科学校説明会</h4>
      <h4>日　時</h4><p>１０月３日(土) １３：００～１７：００<br>１０月１０日(土) １３：００～１７：００</p>
    <h4>場　所</h4><p>西宮地域事務所</p>
      <h4>対　象</h4><p>高等工科学校に興味のある方</p>
    </li></ul>
  </div>
  <h3>川　西</h3>
  <div id="kawanishi1017">
    <h4>高等工科学校進路相談会</h4>
    <h4>日　時</h4><p>●１０月(毎週月・木)１７日(土)<br>①１６：００～１７：００<br>●１０月１７日(土) ０９：００～１８：００</p>
    <h4>場　所</h4><p>川西地域事務所</p>
  </div>
  <h3>川　西</h3>
  <div id="kawanishi1025">
    <h4>自衛隊個別説明会</h4>
    <h4>日　時</h4><p>１０月２５日(日)～１１月１日(日) １０：００～１１：００</p>
    <h4>場　所</h4><p>川西地域事務所</p>
  </div>
  <h3>伊　丹</h3>
  <div id="itami1028">
    <h4>自衛隊・警察 職業説明会</h4>
    <h4>日　時</h4><p>１０月２８日(水)、１１月２５日(水)、１２月１６日(水) ９：３０～１２：００</p>
    <h4>場　所</h4><p>ハローワーク伊丹</p>
    <h4>対　象</h4><p>１８歳～３３歳未満の方</p>
  </div>
</main>`;

test('兵庫新HP: イベント詳細ボックスから日時・場所・対象・締切を取得', { skip }, () => {
  withNow('2026-10-04T10:00:00+09:00', ({ parseHyogoEvents }) => {
    const evs = parseHyogoEvents(cheerio.load(eventHtml, { decodeEntities: false }));
    assert.equal(evs.length, 2);
    const by = Object.fromEntries(evs.map(e => [e.title, e]));
    const ship = by['海上輸送群輸送艦「あまつそら」特別公開'];
    assert.equal(ship.date, '2026-10-24');
    assert.equal(ship.place, '飾磨港4号岸壁');
    assert.equal(ship.time, '09:00～16:00');
    assert.match(ship.ageRequirement, /18歳/);
    assert.match(ship.deadline, /10月19日/);
    assert.equal(ship.url, 'https://www.mod.go.jp/pco/hyogo/event/index.html#amatsusora1024');
    assert.deepEqual(ship._hyogoAssets, ['https://www.mod.go.jp/pco/hyogo/event/flyer/amatsusora1024.pdf']);
    assert.equal(by['掃海艇「あおしま」一般公開'].date, '2026-10-04');
  });
});

test('兵庫新HP: 説明会ボックスの複数日・期間・毎週開催を欠落なく解釈', { skip }, () => {
  withNow('2026-10-04T10:00:00+09:00', ({ parseHyogoSetsumeikai }) => {
    const evs = parseHyogoSetsumeikai(cheerio.load(briefingHtml, { decodeEntities: false }));
    const school = evs.filter(e => e.title === '陸上自衛隊高等工科学校説明会');
    assert.deepEqual(school.map(e => e.date), ['2026-10-10']);

    const recurring = evs.filter(e => e.title === '高等工科学校進路相談会');
    assert.deepEqual(recurring.map(e => e.date), [
      '2026-10-05','2026-10-08','2026-10-12','2026-10-15','2026-10-17',
      '2026-10-19','2026-10-22','2026-10-26','2026-10-29',
    ]);

    const range = evs.filter(e => e.title === '自衛隊個別説明会');
    assert.deepEqual(range.map(e => e.date), ['2026-10-25']);
    assert.match(range[0].notes, /開催期間/);

    const itami = evs.filter(e => e.title === '自衛隊・警察 職業説明会');
    assert.deepEqual(itami.map(e => e.date), ['2026-10-28', '2026-11-25', '2026-12-16']);
    assert.ok(itami.every(e => e.place === 'ハローワーク伊丹'));
  });
});
